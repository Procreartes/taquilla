/**
 * Envío de correos. En local van al capturador (Mailpit por SMTP) y, siempre,
 * quedan registrados en la tabla correos_salientes (visible en el panel).
 * En producción se envía por Microsoft Graph (buzón de Microsoft 365, también compartido, sin contraseña)
 * o por SMTP. Sin ninguno de los dos, los correos solo se registran.
 */
import type { Consultor } from '../db';

export interface Adjunto {
  nombre: string;
  tipo: string;
  contenido: Buffer;
}

export interface Correo {
  organizadorId?: string | null;
  para: string;
  asunto: string;
  html: string;
  texto: string;
  adjuntos?: Adjunto[];
}

export interface Correos {
  enviar(c: Correo): Promise<void>;
}

const MAX_ADJUNTO_GUARDADO = 2 * 1024 * 1024;

export async function crearCorreos(
  db: Consultor,
  opciones: {
    smtpUrl?: string; smtpUsuario?: string; smtpClave?: string; remitente: string; guardarAdjuntos: boolean;
    graph?: OpcionesGraph | null;
  },
): Promise<Correos> {
  let transporte: { sendMail(m: object): Promise<unknown> } | null = null;
  if (opciones.graph) {
    transporte = crearTransporteGraph(opciones.graph, opciones.remitente);
  } else if (opciones.smtpUrl) {
    const nodemailer = (await import('nodemailer')).default;
    if (opciones.smtpUsuario) {
      // Usuario y contraseña aparte: no hace falta codificar caracteres especiales en la URL.
      const u = new URL(opciones.smtpUrl);
      const seguro = u.protocol === 'smtps:';
      transporte = nodemailer.createTransport({
        host: u.hostname,
        port: Number(u.port) || (seguro ? 465 : 587),
        secure: seguro,
        requireTLS: !seguro,
        auth: { user: opciones.smtpUsuario, pass: opciones.smtpClave ?? '' },
      });
    } else {
      transporte = nodemailer.createTransport(opciones.smtpUrl);
    }
  }
  return {
    async enviar(c) {
      let estado = 'capturado', error: string | null = null;
      if (transporte) {
        try {
          await transporte.sendMail({
            from: opciones.remitente, to: c.para, subject: c.asunto, html: c.html, text: c.texto,
            attachments: c.adjuntos?.map((a) => ({ filename: a.nombre, contentType: a.tipo, content: a.contenido })),
            disableFileAccess: true, disableUrlAccess: true,
          });
          estado = opciones.graph ? 'enviado_graph' : 'enviado_smtp';
        } catch (e) {
          estado = 'error';
          error = (e as Error).message.slice(0, 500);
        }
      }
      const adjuntos = (c.adjuntos ?? []).map((a) => ({
        nombre: a.nombre, tipo: a.tipo, bytes: a.contenido.length,
        ...(opciones.guardarAdjuntos && a.contenido.length <= MAX_ADJUNTO_GUARDADO ? { base64: a.contenido.toString('base64') } : {}),
      }));
      await db.query(
        `insert into correos_salientes (organizador_id, para, asunto, html, texto, adjuntos, estado, error) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [c.organizadorId ?? null, c.para, c.asunto, c.html, c.texto, JSON.stringify(adjuntos), estado, error],
      );
      if (estado === 'error') throw new Error(`No se pudo enviar el correo: ${error}`);
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Microsoft Graph: la aplicación de Entra ID envía en nombre de un buzón (Mail.Send de aplicación).
// Funciona con buzones compartidos (sin licencia ni contraseña) y no usa la autenticación básica de SMTP.

export interface OpcionesGraph {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  buzon: string;
}

interface MensajeNodemailerLike {
  to: string; subject: string; html: string; text: string;
  attachments?: { filename: string; contentType: string; content: Buffer }[];
}

/** «Nombre <correo>» → nombre visible; si no hay nombre, null. */
function nombreRemitente(remitente: string): string | null {
  const m = remitente.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return m ? m[1].trim() : null;
}

export function crearTransporteGraph(o: OpcionesGraph, remitente: string, pedir: typeof fetch = fetch) {
  let token: { valor: string; caduca: number } | null = null;
  async function obtenerToken() {
    if (token && token.caduca > Date.now() + 60_000) return token.valor;
    const r = await pedir(`https://login.microsoftonline.com/${encodeURIComponent(o.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: o.clientId, client_secret: o.clientSecret,
        scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
      }),
    });
    const d = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!r.ok || !d.access_token) throw new Error(`Microsoft no dio acceso para enviar correo: ${d.error_description ?? r.status}`);
    token = { valor: d.access_token, caduca: Date.now() + (d.expires_in ?? 3600) * 1000 };
    return token.valor;
  }
  const nombre = nombreRemitente(remitente);
  return {
    async sendMail(m: MensajeNodemailerLike) {
      const cuerpo = {
        message: {
          subject: m.subject,
          body: { contentType: 'HTML', content: m.html },
          from: { emailAddress: { address: o.buzon, ...(nombre ? { name: nombre } : {}) } },
          toRecipients: [{ emailAddress: { address: m.to } }],
          attachments: (m.attachments ?? []).map((a) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.filename, contentType: a.contentType, contentBytes: a.content.toString('base64'),
          })),
        },
        saveToSentItems: true,
      };
      const r = await pedir(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(o.buzon)}/sendMail`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await obtenerToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (r.status !== 202) {
        const t = await r.text().catch(() => '');
        throw new Error(`Microsoft Graph rechazó el correo (${r.status}): ${t.slice(0, 300)}`);
      }
    },
  };
}

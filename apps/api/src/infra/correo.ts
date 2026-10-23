/**
 * Envío de correos. En local van al capturador (Mailpit por SMTP) y, siempre,
 * quedan registrados en la tabla correos_salientes (visible en el panel).
 * Esta plataforma no envía correos reales mientras no se configure un SMTP de producción.
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

export async function crearCorreos(db: Consultor, opciones: { smtpUrl?: string; remitente: string; guardarAdjuntos: boolean }): Promise<Correos> {
  let transporte: { sendMail(m: object): Promise<unknown> } | null = null;
  if (opciones.smtpUrl) {
    const nodemailer = (await import('nodemailer')).default;
    transporte = nodemailer.createTransport(opciones.smtpUrl);
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
          estado = 'enviado_smtp';
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

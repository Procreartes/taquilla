import { describe, expect, it } from 'vitest';
import { crearTransporteGraph } from '../src/infra/correo';

const opciones = { tenantId: 'inquilino', clientId: 'app', clientSecret: 'secreto', buzon: 'entradas@dislateproducciones.com' };

function simulador(respuestaEnvio = 202) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const pedir = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    if (url.includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    return new Response(respuestaEnvio === 202 ? null : 'MailboxNotEnabledForRESTAPI', { status: respuestaEnvio });
  }) as unknown as typeof fetch;
  return { pedir, llamadas };
}

describe('correo por Microsoft Graph', () => {
  it('pide un token y envía desde el buzón con el nombre del remitente y los adjuntos', async () => {
    const { pedir, llamadas } = simulador();
    const t = crearTransporteGraph(opciones, 'Dislate Producciones <entradas@dislateproducciones.com>', pedir);
    await t.sendMail({ to: 'cliente@ejemplo.test', subject: 'Tus entradas', html: '<p>Hola</p>', text: 'Hola',
      attachments: [{ filename: 'entradas.pdf', contentType: 'application/pdf', content: Buffer.from('PDF') }] });
    await t.sendMail({ to: 'otro@ejemplo.test', subject: 'Otra', html: '<p>x</p>', text: 'x' });

    expect(llamadas.filter((l) => l.url.includes('/token'))).toHaveLength(1); // el token se reutiliza
    const envio = llamadas[1];
    expect(envio.url).toBe('https://graph.microsoft.com/v1.0/users/entradas%40dislateproducciones.com/sendMail');
    expect((envio.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    const cuerpo = JSON.parse(envio.init.body as string);
    expect(cuerpo.message.from.emailAddress).toEqual({ address: 'entradas@dislateproducciones.com', name: 'Dislate Producciones' });
    expect(cuerpo.message.toRecipients[0].emailAddress.address).toBe('cliente@ejemplo.test');
    expect(cuerpo.message.attachments[0]).toMatchObject({ name: 'entradas.pdf', contentBytes: Buffer.from('PDF').toString('base64') });
  });

  it('falla con un mensaje claro si Microsoft rechaza el envío', async () => {
    const { pedir } = simulador(403);
    const t = crearTransporteGraph(opciones, 'entradas@dislateproducciones.com', pedir);
    await expect(t.sendMail({ to: 'c@ejemplo.test', subject: 's', html: 'h', text: 't' })).rejects.toThrow(/Graph rechazó el correo \(403\)/);
  });
});

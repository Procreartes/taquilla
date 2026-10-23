/**
 * Apple Wallet y Google Wallet — PREPARADO, sin activar.
 *
 * Qué falta para activarlo (ver docs/ENTRADAS.md):
 *  - Apple: cuenta de Apple Developer, identificador de pase (pass.com.…), certificado de firma
 *    y certificado WWDR. El pase (.pkpass) es un ZIP firmado con pass.json, iconos y manifiesto.
 *  - Google: cuenta de emisor en Google Wallet API, cuenta de servicio (JSON) y clase de evento.
 *    El pase se entrega como enlace «Guardar en Google Wallet» con un JWT firmado.
 *
 * En los dos casos el código de barras del pase llevará el QR ESTÁTICO firmado (los monederos
 * no permiten que el código cambie cada 15 s sin un servidor de actualizaciones).
 */
export interface DatosPase {
  codigo: string;
  qr: string;
  titulo: string;
  fecha: string;
  hora: string | null;
  recinto: string;
  descripcion: string;
  organizador: string;
  colorFondo: string;
}

export interface Monedero {
  readonly nombre: 'apple' | 'google';
  configurado(): boolean;
  crearPase(d: DatosPase): Promise<{ tipo: 'archivo'; contenido: Buffer; mime: string } | { tipo: 'enlace'; url: string }>;
}

export function monederos(env: NodeJS.ProcessEnv = process.env): Monedero[] {
  const pendiente = (nombre: 'apple' | 'google', variables: string[]): Monedero => ({
    nombre,
    configurado: () => variables.every((v) => !!env[v]),
    async crearPase() {
      throw new Error(`${nombre === 'apple' ? 'Apple Wallet' : 'Google Wallet'} no está configurado todavía (faltan ${variables.join(', ')})`);
    },
  });
  return [
    pendiente('apple', ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT', 'APPLE_PASS_KEY', 'APPLE_WWDR_CERT']),
    pendiente('google', ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SERVICE_ACCOUNT']),
  ];
}

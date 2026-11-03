/**
 * Plantillas legales por defecto. TODAS SON BORRADORES pendientes de revisión legal.
 * Cada organizador puede sustituirlas por las suyas (organizadores.textos_legales[idioma][documento]).
 * Esquema RGPD: el organizador es el RESPONSABLE de los datos de sus compradores y la
 * plataforma actúa como ENCARGADA del tratamiento (art. 28 RGPD).
 */
export const DOCUMENTOS_LEGALES = ['aviso-legal', 'privacidad', 'condiciones', 'cookies'] as const;
export type DocumentoLegal = (typeof DOCUMENTOS_LEGALES)[number];

export function plantillaLegal(doc: DocumentoLegal, org?: { nombre: string; razon_social?: string | null; cif?: string | null; direccion_fiscal?: string | null; email_contacto?: string | null }) {
  const titular = org ? `${org.razon_social || org.nombre}${org.cif ? ` (CIF ${org.cif})` : ''}` : '[TITULAR DE LA PLATAFORMA — pendiente]';
  const contacto = org?.email_contacto || '[correo de contacto — pendiente]';
  const textos: Record<DocumentoLegal, string> = {
    'aviso-legal': `Titular: ${titular}.
Domicilio: ${org?.direccion_fiscal || '[pendiente]'}.
Contacto: ${contacto}.

Esta web permite comprar entradas para los eventos de los organizadores que la usan. Cada evento indica quién lo organiza y es responsable de él.`,
    privacidad: `Responsable del tratamiento: ${titular}, organizador del evento para el que compras. Contacto: ${contacto}.
Encargado del tratamiento: la plataforma Taquilla, que gestiona la venta por cuenta del organizador con un contrato de encargo (art. 28 RGPD).

Qué datos tratamos: nombre, correo, teléfono (si lo das), datos de procedencia (código postal, municipio, isla, país) y los datos de tu compra. No guardamos los datos de tu tarjeta: los trata directamente la pasarela de pago.
Para qué: (1) gestionar tu compra, enviarte las entradas y la factura y controlar el acceso — base: ejecución del contrato; (2) cumplir obligaciones fiscales — base: obligación legal; (3) estadísticas agregadas de público para memorias y subvenciones — base: interés legítimo, siempre sin identificarte; (4) enviarte novedades solo si lo marcas — base: tu consentimiento, que puedes retirar en cualquier momento; (5) si aceptas las cookies de medición, medir la eficacia de los anuncios del organizador en Meta (Facebook e Instagram), con tu correo cifrado de forma irreversible, la dirección IP, el navegador y los identificadores de las cookies de Meta — base: tu consentimiento. Para esta finalidad el organizador y Meta Platforms Ireland Ltd. son corresponsables (art. 26 RGPD). Los datos de navegador e IP que se guardan para ello se borran en cuanto se envía la compra.
Cuánto tiempo: lo necesario para la compra y el evento, y después el plazo que exige la ley fiscal (en general, 6 años para facturas).
Tus derechos: acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${contacto}. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
    condiciones: `Organizador del evento: ${titular}.
1. Precio: el precio de cada entrada incluye impuestos. Los gastos de gestión se muestran desde el primer paso.
2. Reserva: al elegir tus entradas te las guardamos unos minutos para que completes el pago.
3. Entrada: recibirás tus entradas por correo y en tu cuenta. En la puerta se valida el código QR (en el móvil, el código cambia cada pocos segundos).
4. Cambios y devoluciones: solo en los casos previstos por la ley o si el evento se cancela; en ese caso se devuelve el importe a la misma tarjeta.
5. Acceso: el organizador puede reservarse el derecho de admisión conforme a la normativa autonómica de espectáculos.
6. Accesibilidad: hay plazas para personas usuarias de silla de ruedas con su acompañante; elígelas en el plano o indícalo al buscar sitio.`,
    cookies: `Cookies técnicas (siempre activas): esta web usa el almacenamiento imprescindible para funcionar — tu sesión si eres del equipo, el idioma elegido, la reserva en curso y tu decisión sobre las cookies de medición. Cloudflare puede usar una cookie técnica de seguridad anti-bots durante la compra.

Cookies de medición publicitaria (solo si las aceptas): si el organizador del evento lo tiene activado, en las páginas de sus eventos usamos el píxel de Meta (Facebook e Instagram) para saber qué anuncios llevan a una visita o a una compra. Crea las cookies _fbp y _fbc (duran hasta 90 días) y envía a Meta Platforms Ireland Ltd. qué páginas ves, si empiezas o terminas una compra y su importe. Al terminar la compra, el organizador envía también ese dato desde el servidor (API de Conversiones) con tu correo cifrado de forma irreversible, para que Meta pueda relacionarlo con tu cuenta sin recibir el correo en claro.

No se activa nada de esto hasta que pulsas «Aceptar». Puedes rechazarlo y comprar igual, y cambiar de opinión cuando quieras con «Configurar cookies», al pie de cada página. Meta puede tratar datos fuera del Espacio Económico Europeo con las garantías del Marco de Privacidad de Datos UE-EE. UU. Más información: www.facebook.com/privacy/policy.`,
  };
  return textos[doc];
}

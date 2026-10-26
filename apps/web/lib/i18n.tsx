'use client';
/**
 * Textos de la web pública en español, inglés y alemán.
 * Las traducciones al inglés y al alemán están PENDIENTES DE REVISIÓN NATIVA.
 */
import { createContext, useContext, useEffect, useState } from 'react';

const es = {
  idioma: 'Idioma',
  cartelera: 'Cartelera',
  heroTitulo: 'Lo mejor se vive en directo', heroSub: 'Entradas para conciertos, festivales y espectáculos en Canarias. Elige tu butaca y llévate la entrada en el móvil.',
  heroEventos: 'Descubrir eventos', heroAgenda: 'Ver la agenda',
  heroMusica: 'Música en vivo', heroMusicaTxt: 'Conciertos y directos', heroFestivales: 'Festivales', heroFestivalesTxt: 'Varios días, varias islas', heroEspectaculos: 'Espectáculos', heroEspectaculosTxt: 'Magia, humor y teatro',
  todas: 'Todas',
  filtrarIsla: 'Filtrar por isla',
  proximamente: 'Próximamente',
  comprar: 'Comprar',
  comprarEntradas: 'Comprar entradas',
  desde: 'Desde',
  gratis: 'Acceso libre',
  gratisDetalle: 'Entrada libre hasta completar aforo. No hace falta entrada.',
  precioPorConfirmar: 'Precio por confirmar',
  entradasProximamente: 'Entradas próximamente',
  ventaOficial: 'Venta oficial en Entradas Canarias',
  agotado: 'Agotado',
  noALaVenta: 'No está a la venta',
  pausada: 'Venta pausada',
  cancelada: 'Cancelada',
  horaPorConfirmar: 'Hora por confirmar',
  funcionPrueba: 'Función de PRUEBA',
  funcionPruebaDetalle: 'Esta función no es real: sirve para probar la plataforma. Paga con la tarjeta de prueba.',
  verificar: 'Datos pendientes de confirmar',
  edadMinima: 'A partir de {n} años',
  paso: 'Paso {n} de 3',
  paso1: 'Elige tus entradas',
  paso2: 'Tus datos y pago',
  paso3: 'Tus entradas',
  elegirEnPlano: 'Elige en el plano',
  mejorSitio: 'Mejor sitio disponible',
  cuantas: '¿Cuántas?',
  zona: 'Zona',
  cualquiera: 'Cualquiera',
  necesitoPmr: 'Necesito un espacio para silla de ruedas',
  buscar: 'Buscar',
  quedan: 'Quedan {n}',
  libre: 'Libre',
  vendida: 'Vendida',
  reservada: 'Reservada',
  elegida: 'Elegida',
  acompanante: 'Acompañante',
  escenario: 'Escenario',
  tuSeleccion: 'Tu selección',
  nada: 'Aún no has elegido nada.',
  quitar: 'Quitar',
  vaciar: 'Vaciar',
  gastosGestion: 'Gastos de gestión',
  porEntrada: '{x} por entrada',
  porcentajePrecio: '{x} % del precio de cada entrada',
  total: 'Total',
  impuestoIncluido: '{imp} incluido ({t} %)',
  continuar: 'Continuar',
  maxEntradas: 'Como máximo {n} entradas por compra',
  tiempoReserva: 'Te guardamos las entradas durante {m}',
  reservaCaducada: 'Se acabó el tiempo de la reserva. Vuelve a elegir tus entradas.',
  nombre: 'Nombre y apellidos',
  email: 'Correo electrónico',
  emailAyuda: 'Ahí te enviamos las entradas.',
  telefono: 'Teléfono (opcional)',
  procedencia: '¿De dónde vienes?',
  procedenciaAyuda: 'Solo para estadísticas de público (se usa de forma agregada).',
  codigoPostal: 'Código postal',
  pais: 'País',
  municipio: 'Municipio',
  isla: 'Isla',
  aceptoCondiciones: 'He leído y acepto las condiciones de compra',
  aceptoPrivacidad: 'He leído la política de privacidad',
  comOrganizador: 'Quiero recibir novedades de {org}',
  comPlataforma: 'Quiero recibir novedades de otros eventos de la plataforma',
  pagar: 'Pagar {x}',
  volver: 'Volver',
  pagoSeguro: 'Pago seguro con tarjeta. No guardamos los datos de tu tarjeta.',
  esperandoPago: 'Estamos confirmando tu pago…',
  pagoCancelado: 'Has cancelado el pago. Tus entradas siguen reservadas unos minutos.',
  listo: '¡Listo! Tus entradas',
  enviadas: 'Te las hemos enviado a {email}.',
  pedido: 'Pedido',
  descargarPdf: 'Descargar PDF',
  verEntradas: 'Ver entradas',
  enseñaQr: 'Enseña este código en la puerta. Cambia cada pocos segundos: una captura de pantalla no sirve.',
  factura: 'Factura simplificada',
  conflicto: 'No hemos podido emitir tus entradas: las plazas dejaron de estar disponibles mientras pagabas. Te devolvemos el importe completo.',
  errorGenerico: 'Algo ha fallado. Vuelve a intentarlo.',
  ocupadas: 'Alguien acaba de elegir alguna de esas butacas. Elige otras.',
  cargando: 'Cargando…',
  cuenta: 'Mis entradas',
  legal: 'Aviso legal',
  privacidad: 'Privacidad',
  condiciones: 'Condiciones de compra',
  cookies: 'Cookies',
} as const;

export type Clave = keyof typeof es;
type Diccionario = Record<Clave, string>;

const en: Diccionario = {
  idioma: 'Language', cartelera: "What's on", heroTitulo: 'The best is live', heroSub: 'Tickets for concerts, festivals and shows in the Canary Islands. Pick your seat and keep your ticket on your phone.', heroEventos: 'Discover events', heroAgenda: 'See the programme', heroMusica: 'Live music', heroMusicaTxt: 'Concerts and gigs', heroFestivales: 'Festivals', heroFestivalesTxt: 'Several days, several islands', heroEspectaculos: 'Shows', heroEspectaculosTxt: 'Magic, comedy and theatre', todas: 'All', filtrarIsla: 'Filter by island', proximamente: 'Coming soon', comprar: 'Buy',
  comprarEntradas: 'Buy tickets', desde: 'From', gratis: 'Free entry', gratisDetalle: 'Free entry while space lasts. No ticket needed.',
  precioPorConfirmar: 'Price to be confirmed', entradasProximamente: 'Tickets coming soon', ventaOficial: 'Official sale at Entradas Canarias',
  agotado: 'Sold out', noALaVenta: 'Not on sale', pausada: 'Sales paused', cancelada: 'Cancelled', horaPorConfirmar: 'Time to be confirmed',
  funcionPrueba: 'TEST show', funcionPruebaDetalle: 'This show is not real: it is used to test the platform. Pay with the test card.',
  verificar: 'Details pending confirmation', edadMinima: 'Ages {n}+', paso: 'Step {n} of 3', paso1: 'Choose your tickets', paso2: 'Your details and payment',
  paso3: 'Your tickets', elegirEnPlano: 'Pick on the seating plan', mejorSitio: 'Best available', cuantas: 'How many?', zona: 'Area', cualquiera: 'Any',
  necesitoPmr: 'I need a wheelchair space', buscar: 'Find', quedan: '{n} left', libre: 'Available', vendida: 'Sold', reservada: 'Held', elegida: 'Selected',
  acompanante: 'Companion', escenario: 'Stage', tuSeleccion: 'Your selection', nada: 'Nothing selected yet.', quitar: 'Remove', vaciar: 'Clear',
  gastosGestion: 'Booking fee', porEntrada: '{x} per ticket', porcentajePrecio: '{x} % of each ticket price', total: 'Total', impuestoIncluido: '{imp} included ({t} %)', continuar: 'Continue',
  maxEntradas: 'Up to {n} tickets per order', tiempoReserva: 'We are holding your tickets for {m}', reservaCaducada: 'Your hold has expired. Please choose your tickets again.',
  nombre: 'Full name', email: 'Email', emailAyuda: 'We will send your tickets here.', telefono: 'Phone (optional)', procedencia: 'Where are you from?',
  procedenciaAyuda: 'For audience statistics only (aggregated).', codigoPostal: 'Postcode', pais: 'Country', municipio: 'Town', isla: 'Island',
  aceptoCondiciones: 'I have read and accept the terms of sale', aceptoPrivacidad: 'I have read the privacy policy', comOrganizador: 'Send me news from {org}',
  comPlataforma: 'Send me news about other events on the platform', pagar: 'Pay {x}', volver: 'Back', pagoSeguro: 'Secure card payment. We do not store your card details.',
  esperandoPago: 'Confirming your payment…', pagoCancelado: 'You cancelled the payment. Your tickets are still held for a few minutes.', listo: 'Done! Your tickets',
  enviadas: 'We have sent them to {email}.', pedido: 'Order', descargarPdf: 'Download PDF', verEntradas: 'View tickets',
  enseñaQr: 'Show this code at the door. It changes every few seconds: a screenshot will not work.', factura: 'Simplified invoice',
  conflicto: 'We could not issue your tickets: the places became unavailable while you were paying. We are refunding the full amount.',
  errorGenerico: 'Something went wrong. Please try again.', ocupadas: 'Someone has just taken one of those seats. Please choose others.', cargando: 'Loading…',
  cuenta: 'My tickets', legal: 'Legal notice', privacidad: 'Privacy', condiciones: 'Terms of sale', cookies: 'Cookies',
};

const de: Diccionario = {
  idioma: 'Sprache', cartelera: 'Programm', heroTitulo: 'Live ist am schönsten', heroSub: 'Tickets für Konzerte, Festivals und Shows auf den Kanarischen Inseln. Platz wählen, Ticket aufs Handy.', heroEventos: 'Events entdecken', heroAgenda: 'Zum Programm', heroMusica: 'Live-Musik', heroMusicaTxt: 'Konzerte und Auftritte', heroFestivales: 'Festivals', heroFestivalesTxt: 'Mehrere Tage, mehrere Inseln', heroEspectaculos: 'Shows', heroEspectaculosTxt: 'Magie, Comedy und Theater', todas: 'Alle', filtrarIsla: 'Nach Insel filtern', proximamente: 'Demnächst', comprar: 'Kaufen',
  comprarEntradas: 'Tickets kaufen', desde: 'Ab', gratis: 'Eintritt frei', gratisDetalle: 'Freier Eintritt, solange Plätze frei sind. Kein Ticket nötig.',
  precioPorConfirmar: 'Preis wird noch bestätigt', entradasProximamente: 'Tickets demnächst', ventaOficial: 'Offizieller Verkauf bei Entradas Canarias',
  agotado: 'Ausverkauft', noALaVenta: 'Nicht im Verkauf', pausada: 'Verkauf pausiert', cancelada: 'Abgesagt', horaPorConfirmar: 'Uhrzeit wird noch bestätigt',
  funcionPrueba: 'TEST-Vorstellung', funcionPruebaDetalle: 'Diese Vorstellung ist nicht echt: Sie dient zum Testen der Plattform. Bezahle mit der Testkarte.',
  verificar: 'Angaben noch nicht bestätigt', edadMinima: 'Ab {n} Jahren', paso: 'Schritt {n} von 3', paso1: 'Tickets wählen', paso2: 'Deine Daten und Zahlung',
  paso3: 'Deine Tickets', elegirEnPlano: 'Im Saalplan wählen', mejorSitio: 'Bester verfügbarer Platz', cuantas: 'Wie viele?', zona: 'Bereich', cualquiera: 'Beliebig',
  necesitoPmr: 'Ich brauche einen Rollstuhlplatz', buscar: 'Suchen', quedan: 'Noch {n}', libre: 'Frei', vendida: 'Verkauft', reservada: 'Reserviert', elegida: 'Ausgewählt',
  acompanante: 'Begleitperson', escenario: 'Bühne', tuSeleccion: 'Deine Auswahl', nada: 'Noch nichts ausgewählt.', quitar: 'Entfernen', vaciar: 'Leeren',
  gastosGestion: 'Servicegebühr', porEntrada: '{x} pro Ticket', porcentajePrecio: '{x} % des Ticketpreises', total: 'Gesamt', impuestoIncluido: 'inkl. {imp} ({t} %)', continuar: 'Weiter',
  maxEntradas: 'Höchstens {n} Tickets pro Bestellung', tiempoReserva: 'Wir halten deine Tickets {m} lang für dich', reservaCaducada: 'Die Reservierung ist abgelaufen. Bitte wähle deine Tickets erneut.',
  nombre: 'Vor- und Nachname', email: 'E-Mail', emailAyuda: 'Dorthin schicken wir deine Tickets.', telefono: 'Telefon (optional)', procedencia: 'Woher kommst du?',
  procedenciaAyuda: 'Nur für Publikumsstatistiken (zusammengefasst).', codigoPostal: 'Postleitzahl', pais: 'Land', municipio: 'Ort', isla: 'Insel',
  aceptoCondiciones: 'Ich habe die Verkaufsbedingungen gelesen und akzeptiere sie', aceptoPrivacidad: 'Ich habe die Datenschutzerklärung gelesen',
  comOrganizador: 'Ich möchte Neuigkeiten von {org} erhalten', comPlataforma: 'Ich möchte Neuigkeiten zu anderen Veranstaltungen der Plattform erhalten',
  pagar: '{x} bezahlen', volver: 'Zurück', pagoSeguro: 'Sichere Kartenzahlung. Wir speichern deine Kartendaten nicht.', esperandoPago: 'Wir bestätigen deine Zahlung…',
  pagoCancelado: 'Du hast die Zahlung abgebrochen. Deine Tickets bleiben noch einige Minuten reserviert.', listo: 'Fertig! Deine Tickets',
  enviadas: 'Wir haben sie an {email} geschickt.', pedido: 'Bestellung', descargarPdf: 'PDF herunterladen', verEntradas: 'Tickets ansehen',
  enseñaQr: 'Zeige diesen Code am Eingang. Er ändert sich alle paar Sekunden: Ein Screenshot funktioniert nicht.', factura: 'Vereinfachte Rechnung',
  conflicto: 'Wir konnten deine Tickets nicht ausstellen: Die Plätze waren während der Zahlung nicht mehr verfügbar. Wir erstatten den vollen Betrag.',
  errorGenerico: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.', ocupadas: 'Jemand hat gerade einen dieser Plätze gewählt. Bitte wähle andere.',
  cargando: 'Wird geladen…', cuenta: 'Meine Tickets', legal: 'Impressum', privacidad: 'Datenschutz', condiciones: 'Verkaufsbedingungen', cookies: 'Cookies',
};

export const IDIOMAS = { es: { nombre: 'Español', locale: 'es-ES', d: es as Diccionario }, en: { nombre: 'English', locale: 'en-GB', d: en }, de: { nombre: 'Deutsch', locale: 'de-DE', d: de } };
export type Idioma = keyof typeof IDIOMAS;

const Ctx = createContext<{ idioma: Idioma; setIdioma: (i: Idioma) => void }>({ idioma: 'es', setIdioma: () => {} });

export function ProveedorIdioma({ children }: { children: React.ReactNode }) {
  const [idioma, setIdiomaEstado] = useState<Idioma>('es');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('lang');
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem('idioma');
    } catch {}
    const nav = navigator.language.slice(0, 2);
    const i = [q, guardado, nav].find((x): x is Idioma => !!x && x in IDIOMAS);
    if (i) setIdiomaEstado(i);
  }, []);
  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);
  const setIdioma = (i: Idioma) => {
    setIdiomaEstado(i);
    try {
      localStorage.setItem('idioma', i);
    } catch {}
  };
  return <Ctx.Provider value={{ idioma, setIdioma }}>{children}</Ctx.Provider>;
}

export function useT() {
  const { idioma, setIdioma } = useContext(Ctx);
  const d = IDIOMAS[idioma].d;
  const t = (k: Clave, v: Record<string, string | number> = {}) => d[k].replace(/\{(\w+)\}/g, (_, n) => String(v[n] ?? ''));
  return { t, idioma, setIdioma, locale: IDIOMAS[idioma].locale };
}

export function SelectorIdioma() {
  const { idioma, setIdioma, t } = useT();
  return (
    <label className="fila small" style={{ gap: 6 }}>
      <span className="sr-only">{t('idioma')}</span>
      <select value={idioma} onChange={(e) => setIdioma(e.target.value as Idioma)} style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }} aria-label={t('idioma')}>
        {Object.entries(IDIOMAS).map(([k, v]) => <option key={k} value={k} lang={k}>{v.nombre}</option>)}
      </select>
    </label>
  );
}

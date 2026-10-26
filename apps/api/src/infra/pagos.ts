/**
 * Capa de pagos con adaptadores. Hoy: Stripe Connect (solo modo prueba) y una pasarela
 * simulada para trabajar sin claves. Preparado para añadir Redsys + Bizum.
 *
 * Regla de oro: el pago solo se da por bueno cuando llega el aviso (webhook) de la pasarela,
 * nunca porque el navegador vuelva a la página de «gracias».
 */
import { createHmac, randomBytes } from 'node:crypto';
import { igualSeguro } from './cripto';

export interface LineaCobro {
  descripcion: string;
  cantidad: number;
  importeUnitarioCent: number;
}

export interface SolicitudSesion {
  pedidoId: string;
  codigoPedido: string;
  lineas: LineaCobro[];
  totalCent: number;
  /** Gastos de gestión: los cobra la plataforma (application fee). */
  comisionPlataformaCent: number;
  cuentaConectada: string | null;
  email: string;
  idioma: string;
  urlOk: string;
  urlCancelar: string;
  caducaEn: Date;
}

export interface SesionPago {
  id: string;
  url: string;
}

export type EventoPago =
  | { id: string; tipo: 'pago_completado'; sesionId: string; pedidoId: string; pagoId: string; importeCent: number; comisionPasarelaCent?: number }
  | { id: string; tipo: 'sesion_caducada'; sesionId: string; pedidoId: string }
  | { id: string; tipo: 'cuenta_actualizada'; cuentaId: string; activa: boolean }
  | { id: string; tipo: 'otro'; tipoOriginal: string };

export interface PasarelaPago {
  readonly nombre: 'stripe' | 'simulada' | 'redsys';
  crearSesion(s: SolicitudSesion): Promise<SesionPago>;
  caducarSesion(sesionId: string, cuentaConectada: string | null): Promise<void>;
  /** Comprueba la firma del aviso y lo traduce. Lanza si la firma no es válida. */
  leerWebhook(cuerpo: Buffer, cabeceras: Record<string, string | string[] | undefined>): Promise<EventoPago>;
  devolver(p: { pagoId: string; importeCent: number; cuentaConectada: string | null; motivo?: string; claveIdempotencia: string }): Promise<{ id: string }>;
  /** Alta de la cuenta conectada del organizador (Stripe Connect). */
  enlaceAlta?(o: { cuentaId: string | null; email: string | null; urlVuelta: string }): Promise<{ cuentaId: string; url: string }>;
}

// ------------------------------------------------------------------------------------------------
// Stripe Connect (cargos directos en la cuenta del organizador + application fee)

export async function crearPasarelaStripe(secreto: string, secretosWebhook: string[], cobroReal = false): Promise<PasarelaPago> {
  const prueba = secreto.startsWith('sk_test_') || secreto.startsWith('rk_test_');
  if (!prueba && !cobroReal) throw new Error('Solo se admiten claves de Stripe en modo prueba (falta COBRO_REAL=true)');
  if (prueba && cobroReal) throw new Error('COBRO_REAL=true con una clave de prueba de Stripe');
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secreto);
  const opciones = (cuenta: string | null) => (cuenta ? { stripeAccount: cuenta } : undefined);
  return {
    nombre: 'stripe',
    async crearSesion(s) {
      if (!s.cuentaConectada) throw new Error('El organizador aún no ha conectado su cuenta de Stripe');
      const sesion = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: s.email,
          client_reference_id: s.pedidoId,
          locale: (['es', 'en', 'de'].includes(s.idioma) ? s.idioma : 'es') as 'es',
          line_items: s.lineas.map((l) => ({ quantity: l.cantidad, price_data: { currency: 'eur', unit_amount: l.importeUnitarioCent, product_data: { name: l.descripcion } } })),
          payment_intent_data: { application_fee_amount: s.comisionPlataformaCent, metadata: { pedido: s.pedidoId, codigo: s.codigoPedido } },
          metadata: { pedido: s.pedidoId, codigo: s.codigoPedido },
          expires_at: Math.floor(s.caducaEn.getTime() / 1000),
          success_url: s.urlOk,
          cancel_url: s.urlCancelar,
        },
        { ...opciones(s.cuentaConectada), idempotencyKey: `sesion-${s.pedidoId}` },
      );
      return { id: sesion.id, url: sesion.url! };
    },
    async caducarSesion(id, cuenta) {
      try {
        await stripe.checkout.sessions.expire(id, undefined, opciones(cuenta));
      } catch {
        /* ya caducada o pagada */
      }
    },
    async leerWebhook(cuerpo, cab) {
      const firma = String(cab['stripe-signature'] ?? '');
      let ev: any = null, ultimoError: unknown;
      for (const s of secretosWebhook) {
        try {
          ev = stripe.webhooks.constructEvent(cuerpo, firma, s);
          break;
        } catch (e) {
          ultimoError = e;
        }
      }
      if (!ev) throw ultimoError ?? new Error('Firma no válida');
      const o = ev.data.object;
      if (ev.type === 'checkout.session.completed' && o.payment_status === 'paid') {
        let comision: number | undefined;
        try {
          const pi = await stripe.paymentIntents.retrieve(o.payment_intent, { expand: ['latest_charge.balance_transaction'] }, opciones(ev.account ?? null));
          comision = (pi.latest_charge as any)?.balance_transaction?.fee;
        } catch {
          /* la comisión se puede recuperar más tarde */
        }
        return { id: ev.id, tipo: 'pago_completado', sesionId: o.id, pedidoId: o.client_reference_id, pagoId: o.payment_intent, importeCent: o.amount_total, comisionPasarelaCent: comision };
      }
      if (ev.type === 'checkout.session.expired') return { id: ev.id, tipo: 'sesion_caducada', sesionId: o.id, pedidoId: o.client_reference_id };
      if (ev.type === 'account.updated') return { id: ev.id, tipo: 'cuenta_actualizada', cuentaId: o.id, activa: !!(o.charges_enabled && o.details_submitted) };
      return { id: ev.id, tipo: 'otro', tipoOriginal: ev.type };
    },
    async devolver(p) {
      const r = await stripe.refunds.create(
        { payment_intent: p.pagoId, amount: p.importeCent, refund_application_fee: true, metadata: { motivo: p.motivo ?? '' } },
        { ...opciones(p.cuentaConectada), idempotencyKey: p.claveIdempotencia },
      );
      return { id: r.id };
    },
    async enlaceAlta(o) {
      const cuentaId = o.cuentaId ?? (await stripe.accounts.create({ type: 'express', country: 'ES', email: o.email ?? undefined, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } })).id;
      const enlace = await stripe.accountLinks.create({ account: cuentaId, refresh_url: o.urlVuelta, return_url: o.urlVuelta, type: 'account_onboarding' });
      return { cuentaId, url: enlace.url };
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Pasarela simulada: imita Stripe Checkout en una página local y firma sus avisos con HMAC.

export interface PasarelaSimulada extends PasarelaPago {
  /** Construye el aviso firmado que mandaría la pasarela (lo usa la página de pago simulado). */
  avisoFirmado(tipo: 'pago_completado' | 'sesion_caducada', sesionId: string, pedidoId: string, importeCent: number): { cuerpo: Buffer; firma: string };
}

export function crearPasarelaSimulada(secreto: string, urlPublica: string): PasarelaSimulada {
  const firmar = (b: Buffer) => createHmac('sha256', secreto).update(b).digest('hex');
  return {
    nombre: 'simulada',
    async crearSesion(s) {
      const id = 'sim_cs_' + randomBytes(12).toString('hex');
      const vuelta = s.urlOk.replace(/\?.*$/, '');
      return { id, url: `${urlPublica}/pago-simulado/${id}?vuelta=${encodeURIComponent(vuelta)}` };
    },
    async caducarSesion() {},
    avisoFirmado(tipo, sesionId, pedidoId, importeCent) {
      const ev = tipo === 'pago_completado'
        ? { id: 'sim_evt_' + randomBytes(10).toString('hex'), tipo, sesionId, pedidoId, pagoId: 'sim_pi_' + randomBytes(10).toString('hex'), importeCent, comisionPasarelaCent: Math.round(importeCent * 0.015) + 25 }
        : { id: 'sim_evt_' + randomBytes(10).toString('hex'), tipo, sesionId, pedidoId };
      const cuerpo = Buffer.from(JSON.stringify(ev));
      return { cuerpo, firma: firmar(cuerpo) };
    },
    async leerWebhook(cuerpo, cab) {
      const firma = String(cab['x-firma-simulada'] ?? '');
      if (!firma || !igualSeguro(firma, firmar(cuerpo))) throw new Error('Firma no válida');
      return JSON.parse(cuerpo.toString('utf8'));
    },
    async devolver() {
      return { id: 'sim_re_' + randomBytes(10).toString('hex') };
    },
    async enlaceAlta(o) {
      return { cuentaId: o.cuentaId ?? 'acct_simulada_' + randomBytes(6).toString('hex'), url: o.urlVuelta + '?stripe=simulado' };
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Redsys + Bizum: hueco preparado. Se implementará cuando haya contrato con un banco (TPV virtual).

export function crearPasarelaRedsys(): PasarelaPago {
  const no = async (): Promise<never> => {
    throw new Error('Redsys/Bizum aún no está configurado: hace falta el TPV virtual del banco');
  };
  return { nombre: 'redsys', crearSesion: no, caducarSesion: no, leerWebhook: no, devolver: no };
}

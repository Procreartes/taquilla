import { describe, expect, it, vi } from 'vitest';

const llamadas: { params: any; opciones: any }[] = [];
const reembolsos: { params: any; opciones: any }[] = [];
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: async (params: any, opciones: any) => { llamadas.push({ params, opciones }); return { id: 'cs_1', url: 'https://checkout.stripe.test/1' }; }, expire: async () => ({}) } };
    refunds = { create: async (params: any, opciones: any) => { reembolsos.push({ params, opciones }); return { id: 're_1' }; } };
    webhooks = { constructEvent: () => ({}) };
  },
}));

import { crearPasarelaStripe, CUENTA_PROPIA } from '../src/infra/pagos';

const sesion = (cuenta: string | null) => ({
  pedidoId: 'p1', codigoPedido: 'PED-1', totalCent: 1620, comisionPlataformaCent: 120, cuentaConectada: cuenta,
  email: 'a@b.test', idioma: 'es', caducaEn: new Date(Date.now() + 600_000),
  lineas: [{ descripcion: 'Entrada', cantidad: 1, importeUnitarioCent: 1500 }, { descripcion: 'Gastos', cantidad: 1, importeUnitarioCent: 120 }],
  urlOk: 'https://x/ok', urlCancelar: 'https://x/no',
});

describe('Stripe: cuenta propia frente a cuenta conectada', () => {
  it('cuenta propia: cobra en la cuenta de la plataforma, sin stripeAccount ni application fee', async () => {
    const p = await crearPasarelaStripe('sk_live_x', ['whsec_x'], true);
    await p.crearSesion(sesion(CUENTA_PROPIA) as any);
    const l = llamadas.at(-1)!;
    expect(l.opciones.stripeAccount).toBeUndefined();
    expect(l.params.payment_intent_data.application_fee_amount).toBeUndefined();
    await p.devolver({ pagoId: 'pi_1', importeCent: 1620, cuentaConectada: CUENTA_PROPIA, claveIdempotencia: 'd1' });
    expect(reembolsos.at(-1)!.params.refund_application_fee).toBeUndefined();
    expect(reembolsos.at(-1)!.opciones.stripeAccount).toBeUndefined();
  });

  it('cuenta conectada: cargo directo en su cuenta con la comisión de la plataforma', async () => {
    const p = await crearPasarelaStripe('sk_live_x', ['whsec_x'], true);
    await p.crearSesion(sesion('acct_123') as any);
    const l = llamadas.at(-1)!;
    expect(l.opciones.stripeAccount).toBe('acct_123');
    expect(l.params.payment_intent_data.application_fee_amount).toBe(120);
  });
});

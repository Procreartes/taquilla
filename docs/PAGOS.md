# Pagos

## Cómo funciona

1. La persona elige sus entradas y pulsa **Continuar**: se reservan 10 minutos (Redis, todas o ninguna).
2. Rellena sus datos y pulsa **Pagar**: la reserva se alarga a 31 minutos (Stripe obliga a que la página de pago dure al menos 30) y se abre la página de pago.
3. La pasarela avisa a la plataforma (*webhook*) de que el pago se ha hecho. **Solo entonces** se emiten las entradas, en una transacción que no deja vender dos veces la misma butaca. Si, por lo que sea, la butaca ya no estaba libre, el pedido pasa a «conflicto» y se devuelve el dinero automáticamente.
4. Cada aviso se registra con su identificador: si la pasarela lo repite, no se procesa dos veces.

## Pasarelas disponibles

| Pasarela | Cuándo se usa |
|---|---|
| **Simulada** | Sin `STRIPE_SECRET_KEY`. Una página local imita Stripe. Tarjeta 4242 4242 4242 4242 (paga) o 4000 0000 0000 0002 (rechazada). Nunca está disponible en producción. |
| **Stripe Connect (modo prueba)** | Con `STRIPE_SECRET_KEY=sk_test_…`. La API se niega a arrancar con una clave `sk_live_`. |
| Redsys + Bizum | Preparado el hueco (`apps/api/src/infra/pagos.ts`). Falta el TPV virtual del banco. |

## Stripe Connect en modo prueba (para cuando Naroe quiera probarlo)

1. Crear una cuenta en Stripe y activar **Connect** (modo prueba).
2. En `.env`: `STRIPE_SECRET_KEY=sk_test_…`.
3. Instalar Stripe CLI y escuchar los avisos en local:
   ```bash
   stripe listen --forward-to localhost:4000/api/pagos/webhook/stripe --forward-connect-to localhost:4000/api/pagos/webhook/stripe
   ```
   Copiar el `whsec_…` que muestra en `STRIPE_WEBHOOK_SECRET` (y en `STRIPE_CONNECT_WEBHOOK_SECRET` si da otro).
4. Panel → **Organizador** → **Conectar con Stripe**: crea la cuenta conectada (Express) del organizador y abre el alta de prueba de Stripe.
5. Comprar una función de prueba con la tarjeta 4242 4242 4242 4242.

**Modelo de cobro:** cargo directo en la cuenta del organizador (él cobra sus ventas y paga la comisión de Stripe) y la plataforma se queda los gastos de gestión como *application fee*. En las devoluciones se devuelve también el *application fee*.

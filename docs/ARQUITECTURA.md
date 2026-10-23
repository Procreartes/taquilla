# Arquitectura de Taquilla

> Documento vivo. Explica cómo está construida la plataforma y por qué. Las decisiones concretas (con fecha y cómo cambiarlas) están en [DECISIONES.md](DECISIONES.md). El estado de cada pieza está en [ESTADO.md](ESTADO.md).

## 1. Visión de conjunto

```
                Cloudflare (DNS · CDN · Turnstile)        ← en producción, más adelante
                               │
          ┌────────────────────┴─────────────────────┐
          │                 apps/web                 │  Next.js (App Router)
          │  · web pública: cartelera, compra, cuenta │  /api/* se reenvía a apps/api
          │  · panel interno (roles)                  │
          │  · app de puerta (PWA, sin conexión)      │
          │  · widget «Comprar» embebible             │
          └────────────────────┬─────────────────────┘
                               │ HTTP (JSON)
          ┌────────────────────┴─────────────────────┐
          │                 apps/api                 │  Fastify + TypeScript
          │  módulos: auth · organizadores · recintos │
          │  planos · eventos · venta · pagos ·       │
          │  entradas · puerta · panel · liquidación  │
          │  · auditoría · webhooks salientes         │
          └──┬───────────────┬───────────────┬───────┘
             │               │               │
     PostgreSQL         Redis            Stripe (Connect, modo prueba)
  (fuente de verdad)  (reservas 10 min,   webhooks = fuente de verdad del pago
                       cola virtual,
                       límites, BullMQ)
                               │
                        Trabajos (BullMQ): correos → Mailpit en local,
                        PDF de entradas, liquidaciones, webhooks n8n

          packages/dominio  ← lógica pura compartida por api y web:
          generador de planos, comprobación, numeración, «mejor sitio»,
          precios e impuestos, firma de QR, liquidación y repartos.
```

## 2. Repositorio

| Carpeta | Qué hay |
|---|---|
| `packages/dominio` | Lógica de negocio pura, sin base de datos ni red. Se prueba con tests unitarios. La usan la API y la web (el editor de planos y la vista previa usan exactamente el mismo generador que el servidor). |
| `apps/api` | Servidor HTTP (Fastify). Habla con PostgreSQL, Redis, Stripe y el correo. |
| `apps/web` | Next.js: web pública, panel, puerta (PWA) y widget. |
| `db/migraciones` | Migraciones SQL numeradas (`0001_...sql`). Se aplican en orden y una sola vez. |
| `datos/` | Semillas reales (programación ASOMBRA 2026, planos oficiales). |
| `scripts/` | Utilidades: semilla, copias de seguridad, prueba de carga. |
| `docs/` | Esta documentación. |

Monorepo con **npm workspaces** (no hace falta instalar nada aparte de Node 22+).

## 3. Dos formas de arrancar

1. **Modo completo** (`docker compose up`): PostgreSQL 16, Redis 7, Mailpit, API y web en contenedores. Es lo que se parecerá a producción (Coolify en el VPS de OVHcloud).
2. **Modo demostración sin Docker** (`npm run demo`): para quien no tenga Docker. La API detecta que no hay `DATABASE_URL` ni `REDIS_URL` y usa:
   - **PGlite**: PostgreSQL real compilado a WebAssembly, guardado en `.datos-locales/`. Mismo SQL y mismas migraciones.
   - **Almacén en memoria** para reservas, cola virtual y límites (mismas operaciones atómicas que el de Redis, en un solo proceso).
   - **Correo capturado** en la propia base de datos, visible en el panel («Correos de prueba»).
   - **Pago simulado** si no hay clave de Stripe de prueba: una pantalla local que imita Stripe Checkout y dispara el mismo webhook firmado.

   Todo lo que se puede probar en este modo pasa por el mismo código que en el modo completo; solo cambian los adaptadores.

## 4. Datos (PostgreSQL)

SQL escrito a mano, sin ORM, con una capa mínima (`apps/api/src/db`) que funciona igual con `pg` (servidor real) y con PGlite.

Entidades principales:

- **organizadores**: CIF, datos fiscales, logo, colores, cuenta de Stripe conectada, textos legales, tipo de impuesto. *Toda* tabla de negocio lleva `organizador_id` y todas las consultas filtran por él (ver §7).
- **usuarios** y **membresias** (usuario × organizador × rol). Roles: `admin`, `produccion`, `taquilla`, `puerta`, `contabilidad`, `lectura`. Un `superadmin` de plataforma ve todos los organizadores.
- **recintos** → **planos** → **versiones_plano**. Una versión en `borrador` se puede editar; al publicarla queda `congelada` (inmutable) y guarda la receta (`plano`) y el resultado (`butacas`) en formato `plano-taquilla/1`.
- **eventos** (festival o evento suelto) → **funciones**. Cada función: recinto, fecha, hora, modo de venta (`numerada` · `general` · `libre`), versión de plano (si numerada), aforo (si general), estado.
- **precios_funcion**: precio por función y zona. Sin precio en todas las zonas, la función no puede ponerse a la venta.
- **socios_evento**: reparto de coproducción (porcentajes que suman 100).
- **pedidos** → **entradas**. Índice único parcial `(funcion_id, butaca_codigo)` para entradas vivas: aunque todo lo demás fallase, la base de datos rechaza vender dos veces la misma butaca.
- **eventos_stripe**: registro de cada webhook recibido (clave única por id de evento) → idempotencia.
- **devoluciones**, **accesos** (lecturas en puerta), **auditoria**, **correos_salientes**, **webhooks_salientes**, **invitaciones**.

## 5. Venta sin sobreventa (tres capas)

1. **Reserva temporal en Redis** (10 minutos): un script Lua reserva *todas* las butacas pedidas o ninguna (`SET NX` con caducidad sobre cada butaca, en una sola operación atómica). Para aforo general, otro script comprueba `vendidas + reservadas + pedidas ≤ aforo` y apunta la reserva en un conjunto ordenado por caducidad.
2. **Pago**: la sesión de Stripe Checkout caduca antes que la reserva. El pedido queda `pendiente` hasta que llega el webhook.
3. **Emisión en PostgreSQL** dentro de una transacción: inserción de entradas protegida por el índice único parcial (numerada) o por `UPDATE ... SET vendidas = vendidas + n WHERE vendidas + n <= aforo` (general). Si por cualquier motivo la butaca ya no está libre (reserva caducada y vendida a otro), el pedido pasa a `conflicto` y se devuelve el dinero automáticamente.

Hay un test de concurrencia que lanza cientos de compras simultáneas de la misma butaca y comprueba que se vende exactamente una.

## 6. Pagos

- Capa `PasarelaPago` con adaptadores: `stripe` (Stripe Connect, **solo claves `sk_test_`**; la API se niega a arrancar con una clave `sk_live_`), `simulada` (local) y hueco preparado para `redsys` (+ Bizum).
- **Stripe Connect con cargos directos**: el cobro se crea en la cuenta conectada del organizador y la plataforma cobra los gastos de gestión como `application_fee_amount`.
- **Webhooks como fuente de verdad**: firma verificada, idempotencia por id de evento, procesamiento transaccional.
- Devoluciones individuales y devolución masiva al cancelar una función (trabajo en cola, reintentos).

## 7. Aislamiento entre organizadores

- Cada petición autenticada lleva un *contexto* (`usuario`, `organizador`, `rol`). Los repositorios exigen `organizador_id` como primer parámetro: no existe una consulta de negocio que no lo pida.
- Tests específicos comprueban que un usuario de un organizador no puede leer ni modificar nada de otro (devuelve 404, no 403, para no revelar existencia).
- Datos públicos (cartelera) solo exponen funciones publicadas.

## 8. Entradas y puerta

- Cada entrada tiene un id aleatorio y dos firmas HMAC-SHA256 con secretos del servidor:
  - **QR estático** (PDF): `T1S.<id>.<firma>`.
  - **QR rotatorio** (móvil): cada entrada recibe una clave derivada `k = HMAC(secreto, id)`. El móvil calcula `T1R.<id>.<ventana>.<HMAC(k, ventana)>` con ventanas de 15 s. Nunca sale de la plataforma el secreto maestro.
- **App de puerta** (PWA): por función descarga la lista de entradas válidas (id, huella de la firma estática, clave derivada, descripción). Valida sin conexión, guarda las lecturas y sincroniza al volver. En línea, la validación es atómica en el servidor (`UPDATE ... WHERE usada_en IS NULL`), así que varios dispositivos no pueden dejar pasar dos veces la misma entrada. Sin conexión, cada dispositivo evita dobles en sí mismo y, al sincronizar, el servidor señala los dobles accesos que hubiera habido entre dispositivos.

## 9. Seguridad (resumen; detalle en `docs/SEGURIDAD.md`)

Validación de toda entrada con esquemas (zod), cabeceras seguras (helmet), cookies `HttpOnly; Secure; SameSite=Lax`, contraseñas con scrypt, 2FA TOTP para el equipo, límites de peticiones por IP y por ruta, Turnstile en la compra, permisos por rol en cada ruta, auditoría de precios/devoluciones/invitaciones/anulaciones, secretos solo en variables de entorno, `npm audit` en CI.

## 10. Escala

- Cola virtual (Redis) para salidas a la venta fuertes: las personas entran por turnos a la compra con un pase firmado.
- API sin estado → se puede escalar en horizontal; Redis es el punto de coordinación.
- Prueba de carga documentada en `docs/CARGA.md` (objetivo: 5.000 personas en cola y 200 compras/minuto sin errores ni sobreventa).

## 11. Despliegue (más adelante, no ahora)

Coolify en el VPS de OVHcloud con el mismo `docker-compose.yml`, Cloudflare delante. Copias de PostgreSQL a Backblaze B2 y al NAS Synology con los scripts de `scripts/copias/`. Nada de esto está desplegado.

# PROMPT — Taquilla: plataforma propia de venta de entradas

> Pega todo lo que hay debajo de la línea en Claude Code, dentro del repo nuevo `Procreartes/taquilla` donde hayas subido este paquete. Está pensado para que trabaje **solo y hasta el final**, sin esperar respuestas.

---

## 0. Modo de trabajo: autónomo hasta el final

Naroe no va a estar disponible mientras trabajas. Por eso:

1. **No te pares a preguntar.** Cuando algo no esté decidido, toma la opción más razonable y conservadora, apúntala en `docs/DECISIONES.md` (qué decidiste, por qué, cómo se cambia) y sigue.
2. **Ejecuta todas las fases del punto 9, una detrás de otra.** Al terminar cada fase: tests en verde, commit, PR a `main` con resumen, merge y siguiente fase. Si una fase no puede terminarse, deja lo hecho funcionando, documenta el bloqueo en `docs/ESTADO.md` y pasa a la siguiente.
3. **Lleva siempre al día `docs/ESTADO.md`**: qué está terminado, qué es demostración, qué espera datos o claves reales, y cómo probar cada cosa paso a paso (sin tecnicismos: Naroe no es programador).
4. **Al acabar**, deja en `docs/ESTADO.md` un apartado «Para Naroe» con: cómo arrancarlo en local con un solo comando, cómo hacer una compra de prueba, qué necesita él para ponerlo en producción y la lista de preguntas pendientes.

### Límites que no se cruzan nunca
- **Nada en producción.** No despliegues en el servidor, no compres dominios, no toques DNS.
- **Pagos solo en modo prueba de Stripe.** Ninguna clave real en el código ni en el repo: todo en variables de entorno con `.env.example`.
- **No toques otros repos** (en particular `Procreartes/asombra-web`) ni la venta oficial de ASOMBRA en Entradas Canarias.
- **No inventes datos reales.** Precios, horarios o aforos que falten se muestran como «por confirmar»; los datos de prueba se marcan como de prueba.
- **No envíes correos ni mensajes reales**: usa un capturador de correo local (Mailpit o similar).

## 1. Qué es y para quién

Plataforma propia de venta de entradas para festivales, teatros, conciertos, magia y humor, con el nivel de las mejores ticketeras (Ticketmaster, DICE, See Tickets, Fever) adaptada a Canarias y España.

- **Usuarios internos**: Grupo Livon y sus sociedades (Dislate Producciones, Me Cabe un Buque, Naroe Consulting), Asociación ProCreArtes, Asociación Educajoven, Out Now Events AIE.
- **Después, clientes externos en marca blanca**: ayuntamientos, cabildos, teatros y promotores.
- **Primeros usos previstos**: ASOMBRA (Festival Internacional de Magia de Canarias), giras de Aarón Gómez, Santa Brígida con Vinos.
- Prioridades de Naroe: **seguridad en varias capas** y **aguantar mucha gente comprando a la vez**.

## 2. Material de este repo (léelo antes de empezar)

| Archivo | Qué es |
|---|---|
| `referencia/prototipo-taquilla.html` | Prototipo validado. Ábrelo en el navegador: cartelera, compra numerada y general, entradas con QR rotatorio, puerta por función, panel y **editor de planos**. Es la referencia de comportamiento y de experiencia. Su lógica de generación de planos (función `generar`) y de comprobación (`comprobar`) es la que hay que portar. |
| `datos/programacion-asombra-2026.json` | Programación real de ASOMBRA 2026 (16 funciones, 6 islas). Es la semilla de datos del festival. |
| `datos/planos/puerto-del-rosario.json` | Plano del Auditorio Insular de Puerto del Rosario: 510 butacas (402 patio + 108 anfiteatro) + 3 PMR. Cuadra con el plano oficial. |
| `datos/planos/antigua.json` | Plano del Centro Cultural Polivalente de Antigua: 377 butacas + 2 PMR. Cuadra con el plano oficial. |
| `referencia/planos-pdf/` | Los planos técnicos oficiales (Cabildo de Fuerteventura) de los que salen los dos anteriores. |

Formato de plano (`plano-taquilla/1`): `plano` es la **receta** (zonas de precio, bloques de filas con numeración, pasillos, espacios PMR, butacas quitadas, filas con distinto número de butacas, ajustes a mano por butaca) y `butacas` es el resultado ya calculado con coordenadas en centímetros. La plataforma debe poder **importar este formato tal cual**.

## 3. Stack e infraestructura

- **Monorepo TypeScript**: Next.js (web pública, panel y app de puerta como PWA) + API (NestJS o Fastify) + paquete compartido de dominio.
- **PostgreSQL** como base de datos; **Redis** para reservas temporales de butacas, cola virtual y límites de peticiones; cola de trabajos (BullMQ) para correos, PDF y liquidaciones.
- **Stripe** como pasarela desde el principio, con **Stripe Connect**: cada organizador tiene su cuenta conectada, cobra sus ventas y la plataforma se queda los gastos de gestión como *application fee*. Webhooks como fuente de verdad del pago, con idempotencia. Capa de pagos con adaptadores para añadir **Redsys + Bizum** después.
- Todo levanta en local con **`docker compose up`** y se podrá desplegar más adelante con **Coolify** en el VPS de OVHcloud que ya tiene Naroe. Cloudflare delante (DNS, CDN, Turnstile anti-bots).
- Copias de la base de datos preparadas para Backblaze B2 y el NAS Synology (scripts y documentación; sin credenciales reales).
- Acceso del equipo interno con **Microsoft 365 (Entra ID)** preparado por configuración; en local, usuario de prueba.

## 4. Modelo de negocio y datos

- **Multi-organizador** desde el día 1: cada organizador con su CIF, datos fiscales, logo, colores, cuenta de Stripe y textos legales. **Los datos de uno nunca se cruzan con los de otro.**
- **Recinto → planos → versiones**. Un recinto puede tener varios planos (aforo completo, sin anfiteatro…). Un plano se edita en borrador; **al ponerlo a la venta queda congelado** y las entradas apuntan a un código de butaca estable (`PLATEA-F17-4`). Cambiar el plano de una función con ventas exige crear versión nueva y trasladar o reasignar.
- **Evento / festival → funciones**. Cada función tiene recinto, fecha, hora y **modo de venta**:
  - **numerada** (si su recinto tiene plano asignado),
  - **aforo general** (sin plano: se vende por cantidad),
  - **acceso libre** (gratis: aparece en la cartelera, no vende).
- Precios por función y zona. Si no hay precio oficial, la función **no se puede poner a la venta** hasta que alguien lo introduzca (en la demo se marca «precio por confirmar»).
- Impuestos configurables: **IGIC** en Canarias, IVA en Península. El tipo concreto lo decide la asesoría: déjalo configurable y marcado como pendiente.
- **Coproducciones**: ASOMBRA es una coproducción al 50 % entre Grupo Livon y Héctor Sansegundo. La liquidación debe permitir repartos por porcentaje entre socios.

## 5. Módulo de planos (pieza central)

Porta el editor del prototipo a la plataforma real:

- Crear un plano por **bloques de filas**: primera y última fila, prefijo, butacas por fila, numeración (consecutiva desde la derecha o la izquierda, o **pares e impares desde el centro** con impares a uno u otro lado), pasillo central, pasillos transversales, zonas de precio por tramos de filas, espacios PMR que sustituyen butacas, butacas que no existen y filas con distinto número de butacas.
- Ajustes a mano sobre la vista previa: cambiar zona, bloqueo técnico, acompañante PMR, visibilidad reducida, quitar.
- **Comprobación automática** contra el aforo del plano oficial: si no cuadra, el plano no puede ponerse a la venta. Avisos para PMR sin acompañante, zonas vacías y bloqueos.
- Importar y exportar en formato `plano-taquilla/1`. Vista SVG a escala, accesible con teclado y lector de pantalla.
- **Tests obligatorios**: Antigua da 377 + 2 PMR; Puerto del Rosario da 510 + 3 PMR; la numeración pares/impares de una fila de 22 con impares a la izquierda da `21 19 … 3 1 2 4 … 22`.

## 6. Venta y entradas

- Cartelera por festival con filtro por isla (colores de isla de la programación de ASOMBRA), ficha de función y compra en máximo 3 pasos, como invitado.
- Selección de butaca en el plano o «mejor sitio disponible» (butacas juntas, fila más cercana, lo más centradas posible; nunca asigna un espacio PMR sin pedirlo).
- **Reserva temporal de 10 minutos** en Redis, **sin sobreventa jamás**: test de concurrencia con cientos de compras simultáneas a la misma butaca.
- Máximo 8 entradas por compra (configurable). Gastos de gestión visibles desde el principio.
- Entrada en PDF y en la cuenta del cliente, con **QR rotatorio firmado** (cambia cada 15 s, firma HMAC con secreto del servidor) y QR estático firmado en el PDF. Preparado para Apple Wallet y Google Wallet.
- Correo de confirmación (en local, al capturador). Factura simplificada por compra.
- Devoluciones individuales y cancelación de una función con devolución masiva por Stripe.

## 7. Puerta, panel e informes

- **App de puerta (PWA)** por función: descarga las entradas válidas, funciona **sin conexión** y sincroniza al volver; varios dispositivos a la vez sin dobles entradas. Mensajes claros: válida, ya usada (con hora), QR caducado, **de otra función** (y cuál), anulada.
- **Panel** por función y por festival: vendidas, ocupación por zona, ingresos, gastos de gestión, pedidos, exportación CSV/Excel, aforo dentro del recinto en tiempo real.
- Invitaciones y protocolo (butacas bloqueadas con nombre), acreditaciones básicas.
- **Liquidación por función** (bruto, impuestos, gastos, comisiones de Stripe, devoluciones, neto, reparto entre coproductores) y **borderó para SGAE**.
- Datos de público agregados (isla/municipio/país de procedencia) para justificar subvenciones y para los informes de impacto que hace Naroe Consulting.
- Webhooks para n8n (venta, agotado, devolución, 90 % de aforo) y widget/botón «Comprar» para insertar en webs como la de ASOMBRA.

## 8. Legal, seguridad y accesibilidad

- RGPD y LOPDGDD: consentimientos separados, cada organizador responsable de sus datos y la plataforma como encargada; textos legales por organizador (plantillas marcadas como borrador para revisión legal).
- **Seguridad en capas**: OWASP Top 10, validación de todas las entradas, límites de peticiones, Turnstile en compra, 2FA para el equipo, permisos por rol (administrador, producción, taquilla, puerta, contabilidad, solo lectura), registro de auditoría de precios, devoluciones, invitaciones y anulaciones, secretos fuera del código, dependencias revisadas.
- **Carga**: cola virtual para salidas a la venta fuertes y prueba de carga documentada (objetivo inicial: 5.000 personas en cola y 200 compras por minuto sin errores ni sobreventa).
- **Accesibilidad WCAG 2.2 AA**, incluida la compra de plazas PMR y acompañante; móvil primero; español, inglés y alemán (traducciones marcadas para revisión nativa).

## 9. Fases (hazlas todas, en orden)

1. **Base**: monorepo, Docker, base de datos con migraciones, organizadores y usuarios con roles, CI con tests, `docs/ARQUITECTURA.md` y `docs/DECISIONES.md`.
2. **Planos**: modelo de recintos, planos y versiones; generador, comprobación, editor, importación de los dos planos de `datos/planos/` y sus tests.
3. **Eventos y funciones**: importador de `datos/programacion-asombra-2026.json` (festival ASOMBRA 2026, organizador de prueba «ASOMBRA (coproducción Grupo Livon · Héctor Sansegundo)»), asignación de los planos de Puerto del Rosario y Antigua, modos de venta, precios por función.
4. **Compra**: cartelera, reserva temporal, checkout con Stripe Connect en modo prueba, webhooks, emisión de entradas, correos al capturador, test de concurrencia sin sobreventa.
5. **Entradas y puerta**: QR firmado rotatorio, PDF, cuenta del cliente, PWA de puerta sin conexión, validación por función.
6. **Panel y dinero**: panel por función y festival, devoluciones, cancelación masiva, liquidación con reparto entre coproductores, borderó SGAE, exportaciones.
7. **Seguridad y carga**: revisión OWASP, auditoría, cola virtual, Turnstile, prueba de carga, copias de seguridad.
8. **Integraciones y acabado**: webhooks n8n, widget embebible, idiomas, accesibilidad revisada, documentación final y apartado «Para Naroe».

## 10. Decisiones pendientes de Naroe (no bloquean: usa el valor por defecto y apúntalo)

| Pendiente | Valor por defecto mientras tanto |
|---|---|
| Nombre comercial de la plataforma | «Taquilla» |
| Entidad que vende ASOMBRA (cuenta de Stripe) | Organizador de prueba «ASOMBRA (coproducción)» |
| Tipo de IGIC de las entradas | 7 %, marcado como pendiente de la asesoría |
| Gastos de gestión | 1 € por entrada, configurable |
| Precios sin dato en la programación | Función no vendible hasta tener precio |
| Numeración del anfiteatro de Puerto del Rosario | A-1 a A-5, impares a la izquierda (supuesto del prototipo) |
| Butacas de acompañante PMR en Puerto del Rosario | Sin marcar; aviso en la comprobación |
| Butaca F-17-4 de Antigua como acompañante | Sí (supuesto) |
| Dominio | Ninguno; todo en local |
| Si ASOMBRA 2026 se vende aquí o sigue en Entradas Canarias | Sigue en Entradas Canarias; aquí solo datos de prueba |

## 11. Empieza ya

Lee el material del punto 2, abre el prototipo, escribe `docs/ARQUITECTURA.md` y arranca la fase 1. No esperes confirmación.

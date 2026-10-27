# Decisiones

Cada decisión tomada sin poder consultar a Naroe: qué se decidió, por qué y cómo cambiarlo. Las más recientes, al final.

## Valores por defecto del encargo (punto 10)

| Pendiente | Valor que se usa | Dónde se cambia |
|---|---|---|
| Nombre comercial de la plataforma | «Taquilla» | Textos de `apps/web` (cabecera, título) y `CORREO_REMITENTE` en `.env` |
| Entidad que vende ASOMBRA (cuenta de Stripe) | Organizador de prueba «ASOMBRA (coproducción Grupo Livon · Héctor Sansegundo)», sin cuenta de Stripe real | Panel → Organizador (datos fiscales y conexión con Stripe) |
| Tipo de IGIC | 7 %, marcado «pendiente de la asesoría» | Panel → Organizador → Venta |
| Gastos de gestión | 1 € por entrada | Panel → Organizador → Venta |
| Precios sin dato | La función no se puede poner a la venta hasta tener precio en todas sus zonas | Panel → Funciones → Precios |
| Numeración del anfiteatro de Puerto del Rosario | A-1 a A-5, impares a la izquierda | Editor de planos (bloque «Anfiteatro») |
| Acompañantes PMR en Puerto del Rosario | Sin marcar; la comprobación lo avisa | Editor de planos → herramienta «Acompañante» |
| F-17-4 de Antigua como acompañante | Sí (supuesto) | Editor de planos |
| Dominio | Ninguno, todo en local | `URL_PUBLICA` en `.env` cuando se despliegue |
| ¿ASOMBRA 2026 se vende aquí? | No: sigue en Entradas Canarias; aquí solo datos de prueba | — |

## Fase 1 · Base

**D-001 · El repositorio de trabajo.** El encargo se pegó desde un paquete en Descargas, pero ya existía `Procreartes/taquilla` en GitHub con ese mismo material. Se trabaja sobre ese repositorio (clonado en `Documentos/IA/ProyectosIA/taquilla`).

**D-002 · npm workspaces en lugar de pnpm o turborepo.** Node ya trae npm; así Naroe no tiene que instalar nada más. Si algún día el monorepo crece mucho, se puede pasar a pnpm sin tocar el código.

**D-003 · Fastify en lugar de NestJS.** El encargo dejaba elegir. Fastify es más ligero, muy rápido (importa para aguantar picos de venta) y con menos «magia», lo que facilita revisar la seguridad. Cambiarlo supondría reescribir las rutas, no la lógica (que vive en `packages/dominio` y en funciones puras).

**D-004 · SQL escrito a mano y migraciones `.sql` numeradas, sin ORM.** Lo crítico (reservas, emisión de entradas, liquidaciones) depende de transacciones e índices concretos de PostgreSQL; con SQL a mano se ve exactamente qué se ejecuta. Las migraciones se aplican solas al arrancar la API (`npm run migrar` también lo hace).

**D-005 · Modo demostración sin Docker.** En el ordenador de trabajo no hay Docker. Para poder probarlo todo (y para que Naroe pueda verlo con un solo comando aunque no tenga Docker) la API, sin `DATABASE_URL`, usa **PGlite** (PostgreSQL real en WebAssembly, guardado en `.datos-locales/`) y, sin `REDIS_URL`, almacenes en memoria con la misma interfaz que los de Redis. `docker compose up` sigue siendo el modo completo. En CI se ejecutan los tests también contra PostgreSQL 16 y Redis 7 reales.

**D-006 · Versiones de dependencias.** Se han elegido versiones estables y con más de dos semanas publicadas (Next 15.5, React 19.1, TypeScript 5.9, Vitest 3.2, Fastify 5) en lugar de las últimas mayores recién salidas, para evitar sorpresas. Se forzó `postcss` a 8.5.31 (dependencia interna de Next) porque la versión que traía tenía avisos de seguridad.

**D-007 · Contraseñas con scrypt (incluido en Node)** en lugar de argon2 (necesita compilar módulos nativos y suele dar guerra en Windows). Parámetros: N=16384, r=8, p=1.

**D-008 · Sesiones con cookie `HttpOnly` y token aleatorio**, guardando en base de datos solo su huella SHA-256. Duran 12 horas. Protección CSRF: cookie `SameSite=Lax` + rechazo de peticiones que cambian datos con cabecera `Origin` de otro sitio.

**D-009 · Verificación en dos pasos (TOTP)** con cualquier aplicación de autenticación. El secreto se guarda cifrado (AES-256-GCM). Se puede exigir a todo el equipo con `EXIGIR_2FA=true` (recomendado en producción). Quien entra con Microsoft 365 no pasa por el TOTP propio: lo cubre la verificación de Microsoft.

**D-010 · Microsoft 365 (Entra ID) sin altas automáticas.** El acceso con Microsoft solo funciona para personas que ya estén dadas de alta en el equipo de algún organizador (se casan por correo la primera vez y luego por el identificador de Entra). Así nadie de la organización entra «por estar en el tenant». Se activa rellenando `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` y `ENTRA_CLIENT_SECRET`.

**D-011 · Superadministración de plataforma.** Existe un rol de plataforma (`superadmin`) que puede dar de alta organizadores y entrar en cualquiera como administración. Es para el equipo que opera Taquilla, no para los organizadores.

**D-012 · Un organizador siempre tiene al menos una persona con rol de administración.** El sistema impide quitar o rebajar al último.

**D-013 · Panel en español; web pública en español, inglés y alemán.** El equipo interno trabaja en español. La traducción del panel queda para más adelante si entran clientes externos que la pidan.

## Fase 2 · Planos

**D-014 · El generador es el del prototipo, línea a línea.** Se ha portado `generar` y `comprobar` a TypeScript sin cambiar la lógica, y un test comprueba que, para Antigua y Puerto del Rosario, produce *exactamente* las mismas butacas (código, zona, tipo y coordenadas) que los ficheros oficiales de `datos/planos/`. Así el plano que se vende es el mismo que se validó.

**D-015 · Congelado protegido también en la base de datos.** Además de la comprobación en la API, un disparador de PostgreSQL impide modificar o borrar una versión congelada. Para cambiar un plano a la venta se crea una versión nueva (copia de la última) y se asigna a las funciones (el traslado de entradas vendidas se hace en la fase 3).

**D-016 · «Mejor sitio» no usa butacas de acompañante ni espacios PMR.** Salvo que se pida expresamente una plaza PMR: entonces da el espacio y, al lado, primero las butacas marcadas como acompañante. Las de acompañante sí se pueden elegir a mano en el plano.

**D-017 · Navegación por teclado del plano.** En lugar de 500 paradas de tabulador, el plano es una sola parada: dentro, las flechas mueven entre butacas e Intro/Espacio elige. Cada butaca tiene su nombre para lectores de pantalla («Fila F-3, butaca 12, acompañante»).

**D-018 · Guardado automático del borrador.** El editor guarda solo cada cambio a los 0,7 s; el servidor vuelve a calcular las butacas y la comprobación, así que lo que se guarda nunca depende del navegador.

**D-019 · Importar no se fía de la lista de butacas del fichero.** Al importar un `plano-taquilla/1` se recalculan las butacas desde la receta y, si no coinciden con las que trae el fichero, se avisa (se usa siempre la receta).

## Fase 3 · Eventos y funciones

**D-020 · ASOMBRA 2026 se carga con sus datos reales pero no se vende aquí.** Las 16 funciones reales aparecen en la plataforma (para que la cartelera y los informes se vean con datos de verdad), pero ninguna se puede poner a la venta: las que tienen venta oficial enlazan a Entradas Canarias y el sistema lo impide expresamente («La venta oficial está en otra plataforma»); las demás no tienen precio oficial. Para probar la compra hay **tres funciones de PRUEBA** marcadas como tales (Antigua y Puerto del Rosario numeradas, y una de aforo general en una «Sala de prueba»).

**D-021 · Modo de venta al importar.** Precio 0 → acceso libre; recinto con plano que cuadra → numerada; si no → aforo general (con el aforo «por confirmar» hasta que alguien lo ponga).

**D-022 · «Precio desde» de la programación.** Cuando la programación dice «desde 11 €» (f01, f02) se pone ese precio a la zona general y se deja una nota «Precio desde 11 €». Como esas funciones se venden en Entradas Canarias, no afecta a la venta.

**D-023 · Precios en céntimos y con impuesto incluido** (como se anuncian al público en España). La base y la cuota se calculan al facturar. Los gastos de gestión también llevan impuesto incluido al tipo del organizador — **pendiente de confirmar con la asesoría**, porque los gastos los factura la plataforma y no el organizador.

**D-024 · Reparto de coproducción sin perder céntimos.** Se usa el método del resto mayor: la suma de lo que recibe cada socio siempre es exactamente el total. Para ASOMBRA: Grupo Livon 50 % y Héctor Sansegundo 50 % (CIF pendientes).

**D-025 · Las direcciones de los eventos (slug) son únicas en toda la plataforma**, porque forman parte de la dirección pública de la cartelera (`/e/asombra-2026`).

**D-026 · Cambiar el plano de una función con ventas.** Se impide desde la ficha normal; se hace con «Cambiar plano», que traslada las entradas a la nueva versión si sus butacas existen y, si no, pide reasignarlas. Se completa en la fase 4, cuando existen las entradas.

## Fase 4 · Compra

**D-027 · La reserva empieza al pulsar «Continuar»**, no al tocar cada butaca (como hacía el prototipo). Así no se bloquean butacas de gente que solo está mirando y Redis trabaja menos en las salidas a la venta fuertes. El plano se refresca cada 15 s y, si alguien se adelanta, se avisa y se quitan esas butacas de la selección.

**D-028 · La reserva se alarga a 31 minutos al ir a pagar.** Stripe Checkout no permite páginas de pago de menos de 30 minutos. En el paso de datos se muestran los 10 minutos; al pulsar «Pagar», la reserva se alarga para cubrir la página de pago. Si se cancela el pago, la reserva se libera al momento.

**D-029 · Tres capas contra la sobreventa** (ver ARQUITECTURA §5). Test: 300 reservas simultáneas de la misma butaca → 1 ok; 200 pagos simultáneos sobre la misma butaca con reservas caducadas → 1 entrada y 199 devoluciones automáticas; aforo general con 250 intentos para 200 plazas → como mucho 200. En CI también contra Redis 7 y PostgreSQL 16 reales.

**D-030 · Pedido con enlace secreto.** Cada pedido tiene un enlace privado (`/pedido/…`) que hace de «llave» para ver las entradas sin crear cuenta (compra como invitado). En la base de datos solo se guarda su huella y una copia cifrada para reenviarlo por correo.

**D-031 · Factura simplificada con numeración correlativa sin huecos** por organizador y año (`ASOMBR-2026-000001`), asignada en la misma transacción que emite las entradas. Plantilla marcada como pendiente de la asesoría.

**D-032 · Pasarela simulada.** Sin claves de Stripe se usa una pasarela local que firma sus avisos con HMAC y los procesa por el mismo camino que un webhook real. No existe en producción.

**D-033 · «Mejor sitio» reserva directamente.** Al buscar mejor sitio, la plataforma elige y reserva a la vez (en el servidor), para que nadie se lo quite entre que se calcula y se reserva.

**D-034 · Datos de procedencia opcionales** (código postal, municipio, isla, país) para los informes agregados de público. Consentimientos separados: condiciones y privacidad (obligatorios), novedades del organizador y novedades de la plataforma (opcionales, desmarcados).

## Fase 5 · Entradas y puerta

**D-035 · El QR rotatorio se calcula en el móvil con una llave por entrada**, derivada del secreto del servidor. Así funciona aunque el móvil del cliente se quede sin cobertura en la cola, y el secreto maestro nunca sale del servidor.

**D-036 · La puerta guarda la huella de la firma estática, no la firma.** Un dispositivo de puerta perdido no permite fabricar QR estáticos válidos. (Sí lleva las llaves de rotación de esa función, necesarias para validar sin conexión.)

**D-037 · El QR incluye el código de la función** (8 caracteres) para poder decir «es de otra función, y cuál» incluso sin conexión.

**D-038 · Sin conexión, gana la primera lectura.** Al sincronizar, si la entrada ya estaba usada, la lectura se marca como «doble acceso» para revisarla. Las sincronizaciones se pueden repetir sin efectos duplicados.

**D-039 · «Dentro» cuenta entradas usadas** (no hay control de salida). Si hace falta controlar salidas y reentradas, se añade un botón «Salida» en la app de puerta.

**D-040 · Cuenta de cliente sin contraseña** (enlace mágico por correo, cookie firmada de 30 días). Ver `docs/ENTRADAS.md`.

**D-041 · Lector de QR**: se usa el lector nativo del navegador (`BarcodeDetector`) cuando existe y, si no, la librería `jsQR`.

## Fase 6 · Panel y dinero

**D-042 · Qué se reparte entre coproductores.** Neto a repartir = recaudación (con impuesto) − devoluciones − comisiones de Stripe − derechos de autor. El impuesto (IGIC/IVA) lo ingresa el organizador y se informa aparte; los **gastos de gestión son de la plataforma** y no entran en el reparto. *Pendiente de validar con la asesoría*, sobre todo si el impuesto debe descontarse antes del reparto.

**D-043 · Comisión de Stripe.** Se toma la real del aviso de pago; si no llega, se estima (1,5 % + 0,25 €) y la liquidación lo indica como «estimada».

**D-044 · Derechos de autor (SGAE) al 10 % de la base imponible**, configurable por organizador y marcado como pendiente hasta tener el contrato/tarifa real. El borderó sale en HTML imprimible y CSV.

**D-045 · Devoluciones.** Individuales por entrada o del pedido completo, con o sin gastos de gestión (a elección de contabilidad). Liberan la butaca al momento y se ejecutan en la pasarela en segundo plano, con reintentos. Si una función se **cancela**, se devuelve todo **con** gastos (como exige la normativa de consumo) y se avisa a cada comprador.

**D-046 · Cancelar exige escribir «CANCELAR».** Es irreversible y mueve dinero: doble confirmación en la pantalla y en la API.

**D-047 · Invitaciones y acreditaciones como pedidos de 0 €** del canal «invitación», con entradas y QR normales (pasan por la misma puerta y no se pueden vender dos veces). El protocolo bloquea butacas a nombre de alguien sin emitir entrada; al emitir la invitación esa butaca se convierte en su entrada.

**D-048 · Datos de público agregados con mínimo de 5 personas por grupo** (los grupos más pequeños se suman en «Otros»), para que nadie sea identificable en informes de subvenciones o de impacto.

**D-049 · Exportaciones CSV (UTF-8, punto y coma, para Excel en español) y Excel (.xlsx).** Se neutralizan las celdas que empiezan por `=`, `+`, `-` o `@` (inyección de fórmulas) y cada exportación queda en la auditoría.

## Fase 7 · Seguridad y carga

**D-050 · Cola virtual por tiempo, sin estado.** Los admitidos se calculan con la hora de apertura y el ritmo (personas por minuto), así todas las instancias de la API coinciden sin coordinarse. Cada persona tiene un número correlativo (Redis `INCR`) y, al llegar su turno, un **pase firmado de 15 minutos** sin el cual no se puede reservar. Se activa por función desde el panel. Ritmo por defecto: 300 personas/minuto (`COLA_PASES_POR_MINUTO`).

**D-051 · Turnstile solo si hay claves.** En local no hay Cloudflare: sin `TURNSTILE_SECRET` la comprobación se omite. Con claves, se exige en la reserva y al entrar en la cola.

**D-052 · Alta de personas del equipo por invitación.** Al añadir a alguien se le envía un enlace de un solo uso (7 días) para definir su contraseña (mínimo 12 caracteres, sin palabras obvias) y después se le pide activar la 2FA.

**D-053 · CSP solo en producción.** El modo de desarrollo de Next.js necesita `eval`; la política de contenidos estricta se aplica al compilar para producción.

**D-054 · Copias cifradas con `age` antes de salir del servidor** y subidas con `rclone` a Backblaze B2 (con Object Lock) y al Synology. Sin clave de cifrado configurada, la copia no se sube a ningún sitio.

**D-055 · La prueba de carga se negará a ejecutarse fuera del modo demostración**, para que nadie la lance por error contra producción.

## Fase 8 · Integraciones y acabado

**D-056 · Webhooks sin datos personales.** Los avisos a n8n llevan la función, la ocupación y el pedido (código, importe, número de entradas), pero no el nombre ni el correo del comprador. Firmados con HMAC por organizador, con reintentos y registro de cada entrega. En producción solo `https` públicas (protección SSRF).

**D-057 · El aviso del 90 % se envía una sola vez por función** (se marca en la base de datos al cruzarlo).

**D-058 · El widget abre la compra en Taquilla en una pestaña nueva** en lugar de comprar dentro del iframe: los navegadores bloquean cada vez más las cookies de terceros y el pago dentro de un iframe da problemas (y confunde al comprador sobre dónde está pagando).

**D-059 · Idiomas.** Web pública, compra, cuenta, widget y correo de confirmación en es/en/de; traducciones marcadas para revisión nativa. Panel solo en español (D-013). Los textos legales por defecto solo en español (los traduce cada organizador si los necesita).

**D-060 · Accesibilidad revisada con axe-core (WCAG 2.2 AA)** en cartelera, ficha y compra, pedido, entrar, panel de ventas, editor de planos y puerta: sin infracciones tras corregir un atributo ARIA en los filtros. Vista móvil (375 px) sin desplazamiento horizontal. Queda pendiente una revisión manual con lector de pantalla (NVDA/VoiceOver) por una persona experta.

**D-061 · La web de ASOMBRA no se ha tocado.** El widget está listo para insertarlo cuando se decida vender ASOMBRA aquí.

## 27/10/2026 · Imágenes y portada
- Las miniaturas para compartir (1200 × 630) y las versiones ligeras para correo y PDF se generan en la API con `sharp` y se guardan en memoria; el original sigue en la base de datos. Si `sharp` fallara, la web sigue funcionando sin miniatura.
- La agenda y la búsqueda filtran en el navegador (pocos cientos de funciones); si crece mucho, se pasará la búsqueda al servidor.
- El enlace al panel sale solo en el pie («Acceso del equipo»), no en la portada.
- Unificar con el portal de Grupo Livon: primero inicio de sesión con Microsoft 365 (Entra ID ya está preparado), luego accesos directos y datos en el portal. La venta pública sigue separada.

## 27/10/2026 · Entrada desde el portal de Grupo Livon
- El portal (repo livon-portal) firma un pase JWT HS256 (emisor `portal-livon`, destinatario `taquilla`, 2 minutos, `jti` de un solo uso guardado en `pases_portal`) y lo manda en el fragmento `#portal=` de /entrar, que no llega a ningún registro de servidor.
- Solo entra quien ya tenga usuario activo en la Taquilla: los roles por organizador siguen dándose en Equipo. No se crean usuarios desde el portal.
- Si la persona entró al portal con Microsoft 365 (`mfa: true`), cuenta como verificación en dos pasos, igual que la entrada directa con Microsoft. Si entró con contraseña o código, la Taquilla pide su código TOTP.
- Clave compartida: `PORTAL_SSO_SECRET` (Taquilla) = `TAQUILLA_SSO_SECRET` (portal), mínimo 32 caracteres.

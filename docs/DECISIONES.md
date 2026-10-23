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

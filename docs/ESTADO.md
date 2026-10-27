# Estado de Taquilla

> Qué está hecho, qué es solo demostración, qué espera datos o claves reales y cómo probar cada cosa. Se actualiza al cerrar cada fase.

## Resumen por fases

| Fase | Estado |
|---|---|
| 1 · Base | ✅ Terminada |
| 2 · Planos | ✅ Terminada |
| 3 · Eventos y funciones | ✅ Terminada |
| 4 · Compra | ✅ Terminada |
| 5 · Entradas y puerta | ✅ Terminada |
| 6 · Panel y dinero | ✅ Terminada |
| 7 · Seguridad y carga | ✅ Terminada |
| 8 · Integraciones y acabado | ✅ Terminada |

## Fase 1 · Base

**Terminado**
- Monorepo (web, API y paquete de lógica compartida), arranque en local con un comando y con Docker.
- Base de datos con migraciones automáticas.
- Organizadores con sus datos fiscales, colores, impuesto, gastos de gestión y máximo de entradas.
- Usuarios del equipo con seis roles (administración, producción, taquilla, puerta, contabilidad, solo lectura) y permisos por rol.
- Verificación en dos pasos, límites de intentos de acceso, registro de auditoría.
- Acceso con Microsoft 365 preparado (falta configurarlo, ver abajo).
- Comprobaciones automáticas en GitHub (CI): tipos, tests con base de datos local, tests con PostgreSQL y Redis reales, compilación de la web, revisión de dependencias e imágenes Docker.

**Es demostración**
- Los dos organizadores que aparecen («ASOMBRA (coproducción…)» y «Teatro de prueba») y todos los usuarios `@taquilla.test`, `@asombra.test` y `@ejemplo.test` son de prueba.

**Espera datos o claves reales**
- Datos fiscales reales de la entidad que venda (CIF, razón social, dirección).
- Microsoft 365: registrar una aplicación en Entra ID y rellenar `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`.

**Cómo probarlo**
1. Arranca la plataforma (ver «Para Naroe» al final).
2. Abre `http://localhost:3000/entrar`. Abajo verás «Usuarios de prueba»: pulsa **Entrar como…** junto a «Gerencia ASOMBRA (prueba)».
3. Ve a **Organizador**, cambia por ejemplo el CIF y pulsa **Guardar cambios**.
4. Ve a **Auditoría**: aparece el cambio con la hora y quién lo hizo.
5. Sal y entra como «Puerta ASOMBRA (prueba)»: no verás ni Organizador ni Equipo (no tiene permiso).
6. Entra como «Teatro de prueba · administración»: en el selector de arriba solo aparece su teatro, nunca ASOMBRA.

## Fase 2 · Planos

**Terminado**
- Recintos con varios planos y cada plano con versiones (borrador → a la venta/congelada).
- Editor de planos por bloques de filas: numeración (desde la derecha, desde la izquierda o pares/impares desde el centro), pasillo central y transversales, zonas por tramos de filas, espacios PMR, butacas que no existen y filas con distinto número de butacas.
- Ajustes a mano sobre la vista previa: zona, bloqueo técnico, acompañante PMR, visibilidad reducida, quitar.
- Comprobación automática contra el aforo oficial: si no cuadra, el botón «Poner a la venta» está desactivado. Avisos de PMR sin acompañante, zonas vacías y bloqueos.
- Importar y exportar en formato `plano-taquilla/1`.
- Plano SVG a escala, manejable con teclado y lector de pantalla.
- Cargados los planos oficiales de Puerto del Rosario (510 + 3 PMR) y Antigua (377 + 2 PMR). Tests: los dos cuadran, salen idénticos a los ficheros oficiales y la fila de 22 numera 21 19 … 3 1 2 4 … 22.

**Es demostración / supuestos**
- Zonas y precios de los dos planos son de ejemplo. Numeración del anfiteatro de Puerto del Rosario (A-1 a A-5, impares a la izquierda) y acompañante F-17-4 de Antigua son supuestos (ver DECISIONES).

**Cómo probarlo**
1. Entra como «Producción ASOMBRA (prueba)» y ve a **Recintos y planos** → **Auditorio Insular** → **Editar**.
2. Abajo verás el plano y arriba «✓ El plano cuadra…» con 510 butacas y 3 PMR.
3. Cambia «Butacas por fila» del patio a 20: la comprobación se pone en rojo y «Poner a la venta» se desactiva. Vuelve a 22.
4. Elige la herramienta «Acompañante PMR» y pulsa una butaca de la fila F-1: el aviso de PMR desaparece. Púlsala otra vez para deshacerlo.
5. Pulsa **Exportar**: se descarga el plano en formato `plano-taquilla/1`. En la ficha del recinto, **Importar plano** lo vuelve a cargar.

## Fase 3 · Eventos y funciones

**Terminado**
- Eventos (festival, gira o evento suelto) con sus funciones: recinto, fecha, hora y modo de venta (numerada, aforo general o acceso libre).
- Importador de la programación: carga ASOMBRA 2026 completo (16 funciones en 6 islas, con colores de isla) y asigna los planos de Puerto del Rosario.
- Precios por función y zona. Sin precio en todas las zonas, la función no se puede poner a la venta (aparece «Precio por confirmar»).
- Coproducción: reparto por porcentajes (ASOMBRA: Grupo Livon 50 % · Héctor Sansegundo 50 %), que debe sumar 100 %.
- Poner a la venta congela el plano. Pausar la venta. Cambios de precio en la auditoría.

**Es demostración**
- Las funciones «Prueba técnica de venta» (Antigua, Puerto del Rosario y aforo general) son ficticias y son las únicas que se pueden comprar.
- Los precios de esas funciones de prueba son inventados (22/18/14 € en Antigua, 15/12 € en Puerto del Rosario, 15 € general).

**Espera datos reales**
- Precios oficiales de Fuerteventura, Holidayworld y El Hierro; aforos de los recintos sin plano; CIF de los socios.

**Cómo probarlo**
1. Entra como «Producción ASOMBRA (prueba)» → **Eventos** → **ASOMBRA 2026**: verás las 19 funciones con su isla, modo de venta, precio y estado.
2. Abre «Más allá de la imaginación» (Puerto del Rosario): dice «Aún no se puede poner a la venta: Precio por confirmar en todas las zonas».
3. Escribe un precio en «Patio de butacas», guarda: ahora dice «1 zona». Pon también «Anfiteatro» y guarda: el botón «Poner a la venta» se activa. (No lo pulses si no quieres; es un dato de prueba.)
4. Abre «La Maga»: indica que su venta oficial está en Entradas Canarias y no deja venderla aquí.
5. Abajo del evento, el reparto de coproducción: si pones 60 % y 30 % y guardas, avisa de que debe sumar 100 %.

## Fase 4 · Compra

**Terminado**
- Web pública: cartelera del festival con filtro por isla (colores de ASOMBRA), ficha de función, compra en 3 pasos como invitado. En español, inglés y alemán.
- Elegir butaca en el plano o «mejor sitio disponible» (juntas, fila más cercana, centradas; PMR solo si se pide, con su acompañante). Aforo general por cantidad.
- Reserva de 10 minutos sin sobreventa (probado con cientos de compras a la vez), máximo 8 entradas por compra, gastos de gestión visibles desde el primer paso.
- Pago con Stripe Connect (modo prueba) o con la pasarela simulada; los avisos de pago son la fuente de verdad y no se procesan dos veces.
- Entradas emitidas, factura simplificada, correo de confirmación (capturado: se ve en el panel → **Correos de prueba**).
- Devolución automática si un pago llega cuando la butaca ya no está libre.
- Cambiar el plano de una función con ventas, trasladando o reasignando butacas (y avisando por correo).

**Es demostración**
- La pasarela simulada (no cobra nada). Las tres funciones «Prueba técnica de venta».

**Espera claves reales**
- Claves de **prueba** de Stripe y alta de la cuenta conectada (ver `docs/PAGOS.md`). Turnstile de Cloudflare.

**Cómo probarlo (una compra de prueba)**
1. Abre `http://localhost:3000` → **ASOMBRA 2026**. Pulsa el filtro **Fuerteventura**.
2. En «Prueba técnica de venta · Antigua» pulsa **Comprar**.
3. Pulsa **Buscar** en «Mejor sitio disponible» (o toca butacas en el plano y **Continuar**).
4. Rellena nombre y correo (inventados), marca las dos casillas obligatorias y pulsa **Pagar**.
5. En la página de pago simulado deja la tarjeta 4242 4242 4242 4242 y pulsa **Pagar**.
6. Verás tus entradas y la factura. En el panel (**Entrar** → «Gerencia ASOMBRA») → **Correos de prueba** está el correo que habría recibido la persona.

## Fase 5 · Entradas y puerta

**Terminado**
- Entrada en el móvil con QR rotatorio firmado (cambia cada 15 s) y PDF con QR estático firmado (adjunto en el correo y descargable).
- «Mis entradas»: cuenta del cliente con enlace por correo, sin contraseña.
- App de puerta (PWA) por función: descarga las entradas, lee con la cámara o a mano, funciona sin conexión y sincroniza al volver. Varios dispositivos a la vez sin dobles entradas (en línea). Mensajes claros: adelante, ya usada (con hora), QR caducado, de otra función (y cuál), anulada, manipulada.
- Aforo dentro en tiempo real.

**Preparado, sin activar**
- Apple Wallet y Google Wallet (faltan certificados, ver `docs/ENTRADAS.md`).

**Cómo probarlo**
1. Haz una compra de prueba (fase 4). En la página final verás los QR moviéndose (la barra azul marca los 15 s).
2. Pulsa **Descargar PDF**: cada entrada en una página con su QR.
3. En otra pestaña (o en el móvil, en la misma red) abre `http://localhost:3000/puerta`, entra como «Puerta ASOMBRA (prueba)» y elige la función de prueba de Antigua.
4. Escribe el código de una entrada (`TKT-…`, aparece debajo del QR) y pulsa **Validar**: «Adelante». Vuelve a validarla: «Ya utilizada» con la hora.
5. Sin conexión: con la función elegida, desactiva la red del ordenador y valida otra entrada: dice «Validado sin conexión». Vuelve a activar la red: en unos segundos se sincroniza sola.
6. **Mis entradas** (arriba a la derecha en la web): escribe el correo con el que compraste; el enlace llega a **Correos de prueba** del panel.

## Fase 6 · Panel y dinero

**Terminado**
- Panel por función: vendidas, ocupación por zona, ingresos, gastos de gestión, pedidos con buscador, aforo dentro en tiempo real, exportación CSV y Excel.
- Panel e informe por festival: totales, tabla por función, liquidación del festival con reparto y procedencia del público (isla, país, municipio) agregada.
- Devoluciones individuales y de pedido (con o sin gastos) y cancelación de función con devolución masiva y aviso por correo.
- Invitaciones, acreditaciones y protocolo (butacas bloqueadas con nombre).
- Liquidación por función (bruto, impuesto, comisiones de Stripe, devoluciones, derechos de autor, neto y reparto entre coproductores) y borderó para la SGAE.

**Pendiente de la asesoría / SGAE**
- Si el reparto se hace antes o después de impuestos; tipo de derechos de autor (10 % provisional).

**Cómo probarlo**
1. Haz un par de compras de prueba (fase 4).
2. Panel → **Eventos** → ASOMBRA 2026 → «Prueba técnica de venta · Antigua» → **Ventas y pedidos**: verás vendidas, ocupación por zona e ingresos. Pulsa **Pedidos Excel**.
3. Pulsa el código de un pedido → **Devolver esta** (escribe un motivo). En unos segundos aparece «hecha» y la butaca vuelve a estar libre en la web.
4. **Invitaciones y protocolo**: toca dos butacas en el plano, escribe un nombre y pulsa **Solo bloquear (protocolo)**: en la web pública aparecen como no disponibles. Selecciónalas otra vez y pulsa **Emitir invitación**.
5. **Liquidación**: reparto entre Grupo Livon y Héctor Sansegundo, y el **Borderó SGAE** para imprimir.
6. En la ficha del evento, **Informe del festival** muestra totales, liquidación y procedencia del público.

## Fase 7 · Seguridad y carga

**Terminado**
- Revisión OWASP Top 10 punto por punto (`docs/SEGURIDAD.md`), auditoría completa de acciones sensibles.
- Cola virtual (sala de espera) por función, con pase firmado y hora de apertura.
- Turnstile de Cloudflare en la reserva y en la cola (se activa con las claves).
- Invitación del equipo con enlace para definir contraseña fuerte; política de contenidos (CSP) y HSTS en producción; Dependabot.
- Prueba de carga superada en local: 5.000 personas en cola y 200 compras/minuto sin errores ni sobreventa (`docs/CARGA.md`).
- Copias de seguridad: scripts de copia cifrada a Backblaze B2 y NAS Synology y de restauración (`docs/COPIAS.md`).

**Espera claves o servidor**
- Claves de Turnstile, cuentas de B2 y del NAS, y repetir la prueba de carga en el VPS real.

**Cómo probarlo**
1. Panel → función «Prueba técnica de venta · Antigua» → **Cola virtual**: marca «Activar la sala de espera», pon la apertura dentro de 2 minutos y guarda.
2. Abre la función en la web pública: aparece la **Sala de espera**. Pulsa «Entrar en la cola»: verás la hora de apertura y, al llegar, tu turno.
3. Vuelve al panel y desactiva la cola al terminar.

## Fase 8 · Integraciones y acabado

**Terminado**
- Webhooks para n8n (venta, agotado, devolución, 90 % de aforo), firmados, con reintentos y registro.
- Botón / widget «Comprar» para insertar en otras webs (botón o cartelera completa), con generador de código en el panel.
- Web pública, compra, cuenta, widget y correo de confirmación en español, inglés y alemán (traducciones pendientes de revisión nativa).
- Accesibilidad revisada con axe-core (WCAG 2.2 AA) en las pantallas principales y en móvil.
- Prueba de humo en CI del entorno completo con Docker (PostgreSQL, Redis, Mailpit, API, trabajador y web).
- Documentación final (`README.md` y `docs/`).

**Cómo probarlo**
1. Panel (como «Gerencia ASOMBRA») → **Integraciones**. Si tienes n8n, crea un *Webhook* y pega su URL; pulsa **Enviar prueba**. Debajo verás si se entregó.
2. En la misma pantalla, «Botón Comprar para otras webs»: elige el evento y «Cartelera completa» y pulsa **abrir** en la vista previa.
3. Cambia el idioma de la web pública arriba a la derecha (English / Deutsch).

---

## Portada, agenda, miniaturas y entradas con cartel (27/10/2026)

**Terminado**
- **Cabecera** fija con Cartelera, Agenda, Mis entradas, **buscador** e idioma; en el móvil, **menú hamburguesa**. El acceso del equipo pasa a un enlace discreto en el pie.
- **Portada**: arreglado el fondo de la cabecera (se veía una franja); los botones «Descubrir eventos» y «Ver la agenda» y las tarjetas Música en vivo / Festivales / Espectáculos ya llevan a su sitio.
- **Evento destacado**: en el panel, «Datos del evento» → «Destacar este evento» (+ imagen panorámica opcional, ideal 1920 × 800). Sale en grande bajo la cabecera.
- **Categoría** de cada evento (Música, Espectáculos, Festival, Otros) para los filtros.
- **Agenda** (/agenda): todas las próximas funciones por meses, con buscador (nombre, artista, lugar, isla) y filtros.
- **WhatsApp y redes**: cada evento y función tiene su miniatura 1200 × 630 hecha con su cartel; la portada tiene una imagen propia. Icono de pestaña, icono de móvil, manifest, robots.txt y sitemap.xml.
- **Entradas con cartel**: el cartel sale en el PDF, en el correo de confirmación y en la página de entradas del móvil.

**Cómo probarlo**
1. Abre la portada en el móvil: menú ☰ arriba a la derecha, busca «Tejina» y verás la función.
2. Pega el enlace de una función en WhatsApp: debe salir la miniatura con el cartel.
3. Compra una entrada de prueba: el correo y el PDF llevan el cartel.

## Crear eventos desde el panel (27/10/2026)

**Terminado**: cualquier persona con rol Producción (o Administración) puede crear un evento entero sin JSON ni ayuda técnica.

- **Imágenes**: cada evento (y si se quiere, cada función) tiene dos: el **cartel vertical** (ficha de compra) y la **imagen para listados** cuadrada o apaisada (portada y tarjetas). Si falta una se usa la otra; una función sin imágenes usa las del evento. Se suben desde el ordenador o el móvil (JPG, PNG o WebP, hasta 5 MB; las fotos enormes se reducen solas) y se guardan en la propia plataforma.
- **Cómo se hace, paso a paso**:
  1. Panel → **Eventos** → **+ Nuevo evento**: nombre, tipo, descripción, cartel e imagen para listados. Marca «Publicado en la web» cuando quieras que salga en la portada. Pulsa «Crear evento y seguir».
  2. Aparece **Nueva función**: título, fecha, hora, recinto, tipo de venta (butaca numerada con plano, entrada general con aforo, o gratis), precio (igual para todas las zonas) y, si la venta oficial es en otra web, su enlace. Pulsa «Crear función».
  3. Se abre la función en **borrador**: revisa precios por zona, invitaciones y acreditaciones, bloqueos de taquilla, y pulsa **Poner a la venta**.
  4. Para cambiar algo después: en el evento, «Datos del evento e imágenes»; en la función, «Datos de la función e imágenes». Con entradas vendidas no se puede cambiar el recinto ni el tipo de venta.
- Si el recinto no existe, se crea antes en **Recintos y planos**.

## Para Naroe

### 1. Arrancarlo en tu ordenador (un solo comando)

Necesitas tener instalado **Node.js 22 o superior** (https://nodejs.org, botón «LTS»). Luego, en una terminal dentro de la carpeta `taquilla`:

```bash
npm install
npm run demo
```

La primera vez tarda un par de minutos. Cuando ponga `Ready`, abre **http://localhost:3000**. Para pararlo, pulsa `Ctrl + C` en la terminal.

- No hace falta Docker ni ninguna clave: usa una base de datos local (carpeta `.datos-locales`, que puedes borrar para empezar de cero) y una pasarela de pago simulada.
- El panel está en **http://localhost:3000/entrar**: abajo aparecen los **usuarios de prueba** con el botón **Entrar como…** (sin contraseña). Cada uno tiene un rol distinto. Si prefieres entrar con contraseña, copia `.env.example` como `.env`: la contraseña de todos los usuarios de prueba es el valor de `CLAVE_USUARIOS_PRUEBA`.
- La app de puerta está en **http://localhost:3000/puerta**.
- Si tienes Docker y quieres el entorno completo (PostgreSQL, Redis y Mailpit): `docker compose up --build`. Los correos se ven en http://localhost:8025.

### 2. Hacer una compra de prueba

1. Abre http://localhost:3000 → **ASOMBRA 2026**.
2. Filtra por **Fuerteventura** y, en **«Prueba técnica de venta · Antigua»** (marcada como PRUEBA), pulsa **Comprar**.
3. Pulsa **Buscar** en «Mejor sitio disponible» (o toca butacas en el plano y **Continuar**).
4. Escribe un nombre y un correo inventados, marca las dos casillas obligatorias y pulsa **Pagar**.
5. En la pasarela simulada deja la tarjeta **4242 4242 4242 4242** y pulsa **Pagar**. (La 4000 0000 0000 0002 simula una tarjeta rechazada.)
6. Verás tus entradas con el QR que cambia cada 15 segundos, el PDF y la factura simplificada.
7. El correo que habría recibido la persona está en el panel → **Correos de prueba**.
8. Para validarla: http://localhost:3000/puerta → entra como «Puerta ASOMBRA (prueba)» → elige la función → escribe el código `TKT-…` de la entrada → **Validar**. La segunda vez dirá «Ya utilizada».

Las funciones reales de ASOMBRA aparecen en la cartelera pero **no se pueden comprar aquí** (enlazan a Entradas Canarias o tienen el precio por confirmar).

### 3. Qué hace falta para ponerlo en producción

Nada de esto se ha hecho (por las reglas del encargo). Por orden:

1. **Decisiones** de la lista de preguntas de abajo (sobre todo entidad vendedora, IGIC y gastos de gestión).
2. **Dominio** y **Cloudflare** delante (DNS, CDN, Turnstile: crear un *widget* y poner `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET`).
3. **Despliegue en Coolify** (VPS de OVHcloud) con el `docker-compose.yml`: PostgreSQL 16, Redis 7, API, trabajador y web. Variables: ver `.env.example` y `docs/SEGURIDAD.md` («Antes de producción»): secretos propios, `NODE_ENV=production`, `EXIGIR_2FA=true`, `TRUST_PROXY=true`, `URL_PUBLICA`.
4. **Correo real**: un servicio SMTP (Microsoft 365, Brevo, Amazon SES…) con SPF, DKIM y DMARC del dominio → `SMTP_URL`.
5. **Stripe**: cuenta de la plataforma con **Connect**; primero en modo prueba (`docs/PAGOS.md`), y cuando todo esté validado, las claves reales. ⚠️ El código hoy **rechaza a propósito las claves reales** (`sk_live_`): habrá que quitar ese bloqueo en `apps/api/src/config.ts` e `infra/pagos.ts` conscientemente el día que se vaya a vender de verdad.
6. **Cada organizador**: datos fiscales completos en el panel y alta en Stripe con **Conectar con Stripe**.
7. **Microsoft 365** para el equipo: registrar una aplicación en Entra ID (redirección `https://DOMINIO/api/auth/entra/vuelta`) → `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`.
8. **Copias**: Backblaze B2 + NAS Synology (`docs/COPIAS.md`).
9. **Revisión legal** de los textos (privacidad, condiciones, aviso legal, cookies) y contrato de encargado de tratamiento con cada organizador.
10. **Repetir la prueba de carga** en el servidor real (`docs/CARGA.md`) y una **auditoría de seguridad externa** antes de la primera venta real.
11. Opcional: Apple/Google Wallet (certificados), Redsys + Bizum (TPV del banco).

### 4. Preguntas pendientes (con lo que se ha supuesto mientras tanto)

| # | Pregunta | Supuesto actual |
|---|---|---|
| 1 | ¿Nombre comercial de la plataforma? | «Taquilla» |
| 2 | ¿Qué entidad vende ASOMBRA (razón social, CIF, cuenta de Stripe)? | Organizador de prueba «ASOMBRA (coproducción…)» sin datos fiscales |
| 3 | ¿Tipo de IGIC de las entradas? | 7 %, pendiente de la asesoría |
| 4 | ¿Los gastos de gestión llevan IGIC/IVA y quién los factura (plataforma u organizador)? | Llevan el impuesto del organizador; los cobra la plataforma |
| 5 | ¿Gastos de gestión de 1 € por entrada? ¿Se devuelven en las devoluciones individuales? | 1 €; en individuales lo decide contabilidad en cada caso; en cancelaciones, siempre |
| 6 | Precios oficiales de Fuerteventura, Holidayworld y El Hierro, y aforos de los recintos sin plano | «Precio por confirmar»: no se pueden vender |
| 7 | Numeración del anfiteatro de Puerto del Rosario | A-1 a A-5, impares a la izquierda |
| 8 | ¿Qué butacas son de acompañante PMR en Puerto del Rosario? | Ninguna marcada (aviso en la comprobación) |
| 9 | ¿La F-17-4 de Antigua es de acompañante? | Sí |
| 10 | Reparto de la coproducción ASOMBRA: ¿sobre el neto después de comisiones y derechos de autor? ¿CIF de los socios? | 50 % / 50 % del neto tras comisiones de Stripe y derechos de autor |
| 11 | ¿Porcentaje y forma de cálculo de la SGAE? | 10 % de la base imponible, pendiente |
| 12 | ¿Dominio? | Ninguno |
| 13 | ¿ASOMBRA 2026 se venderá aquí o sigue en Entradas Canarias? | Sigue en Entradas Canarias |
| 14 | ¿Hace falta controlar salidas y reentradas en puerta? | No: «dentro» = entradas usadas |
| 15 | ¿El panel tiene que estar también en inglés/alemán para clientes externos? | Solo español |
| 16 | ¿Revisión nativa de las traducciones al inglés y al alemán? ¿Quién? | Pendiente |
| 17 | ¿Banco para Redsys + Bizum? | Sin activar |

### 5. Sobre las PRs automáticas de Dependabot

Al activar las actualizaciones automáticas, GitHub abrió varias PRs de **versiones mayores** (Node 25, BullMQ 6, Fastify rate-limit 11…). No se han fusionado: las versiones mayores pueden romper cosas y Node 25 no es una versión de soporte largo. La configuración ya está ajustada para que en adelante solo proponga actualizaciones menores y de seguridad; esas PRs se pueden cerrar sin miedo (o revisarlas una a una con calma).

Las decisiones técnicas tomadas sin poder consultarte están explicadas, con cómo cambiarlas, en [DECISIONES.md](DECISIONES.md).

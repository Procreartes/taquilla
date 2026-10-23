# Seguridad

Revisión según **OWASP Top 10 (2021)** y medidas por capas. Cada punto dice qué hay y dónde está.

## OWASP Top 10

| Riesgo | Medidas |
|---|---|
| **A01 Control de acceso roto** | Seis roles con permisos explícitos (`packages/dominio/src/roles.ts`) comprobados en cada ruta (`exigir()`). Todas las consultas de negocio filtran por `organizador_id` de la sesión; un recurso de otro organizador responde 404 (no revela que existe). Tests de aislamiento en cada fase y test de que el rol de puerta no llega a nada de dinero ni administración. Enlaces de cliente (pedido, cuenta) con *tokens* aleatorios de 192 bits. |
| **A02 Fallos criptográficos** | Contraseñas con scrypt. Secreto TOTP cifrado con AES-256-GCM. Sesiones: solo se guarda la huella SHA-256 del *token*. QR firmados con HMAC-SHA256 y llaves derivadas (el secreto maestro no sale del servidor). HTTPS obligatorio en producción (Cloudflare + HSTS). Cookies `HttpOnly`, `Secure` en producción, `SameSite=Lax`. |
| **A03 Inyección** | Todo el SQL usa parámetros (`$1`, `$2`…); los nombres de columna dinámicos salen de listas cerradas de esquemas zod. Validación de toda entrada con zod. HTML de correos, facturas y borderó con escapado. CSV/Excel neutralizan fórmulas (`=`, `+`, `-`, `@`). Test de inyección SQL en el buscador. |
| **A04 Diseño inseguro** | Sobreventa imposible por diseño (tres capas, ver ARQUITECTURA §5). Pagos solo por aviso firmado e idempotente. Cancelación con doble confirmación. Planos congelados protegidos en la base de datos. Datos de público agregados (mínimo 5 por grupo). |
| **A05 Configuración insegura** | La API no arranca en producción con secretos por defecto ni con claves `sk_live_` de Stripe. Cabeceras de seguridad (helmet en la API; CSP, HSTS, `X-Frame-Options`, `Permissions-Policy` en la web). Pasarela simulada y usuarios de prueba imposibles en producción. Puertos de Docker solo en `127.0.0.1`. |
| **A06 Componentes vulnerables** | `npm audit --audit-level=high` en cada PR (CI) — hoy 0 avisos. Dependabot semanal. Versiones fijadas y con más de dos semanas publicadas. Se forzaron versiones parcheadas de `postcss` y `uuid`. |
| **A07 Fallos de autenticación** | Límite de intentos de acceso por IP (10/min). Mismo mensaje para correo o contraseña incorrectos. 2FA TOTP (obligatoria con `EXIGIR_2FA=true`). Contraseñas de al menos 12 caracteres y lista de contraseñas débiles. Enlaces de invitación de un solo uso (7 días). Microsoft 365 sin altas automáticas. Sesiones de 12 h que se borran al salir. |
| **A08 Integridad de datos y software** | Webhooks de pago con firma verificada sobre el cuerpo exacto. Imágenes Docker construidas en CI. Migraciones versionadas. |
| **A09 Registro y monitorización** | Auditoría (no se puede borrar desde la app) de: accesos y fallos, 2FA, equipo y roles, datos del organizador, precios, planos congelados, importaciones, cambios de plano, invitaciones, protocolo, anulaciones, devoluciones, cancelaciones, exportaciones y alta en Stripe. Logs de la API sin cookies ni cabeceras de autorización. |
| **A10 SSRF** | La API solo llama a Stripe, Cloudflare Turnstile, Microsoft y, en la fase 8, a los webhooks configurados por el organizador (solo `https` y nunca a direcciones privadas en producción). |

## Otras capas

- **Anti-bots**: Cloudflare Turnstile en la reserva y al entrar en la cola virtual (se activa con `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET`).
- **Límites de peticiones**: global por IP, específicos en acceso, compra y cola. Con Redis, compartidos entre instancias.
- **CSRF**: cookies `SameSite=Lax` + rechazo de peticiones que cambian datos desde otro origen + cuerpo JSON obligatorio.
- **Datos personales**: cada organizador es responsable de los suyos; la plataforma solo accede como encargada. Los listados públicos nunca muestran datos de compradores.
- **Secretos**: solo en variables de entorno (`.env.example` documenta cuáles); `.env` está en `.gitignore`.

## Antes de producción (pendiente)

- [ ] Generar secretos propios (`openssl rand -base64 48`) para `SECRETO_*`.
- [ ] `EXIGIR_2FA=true`, `TRUST_PROXY=true`, `NODE_ENV=production`.
- [ ] Turnstile y reglas de Cloudflare (WAF, límite por país si hace falta, «Under Attack» para salidas fuertes).
- [ ] Revisión externa (pentest) antes de la primera venta real.
- [ ] Contrato de encargado del tratamiento (art. 28 RGPD) con cada organizador.

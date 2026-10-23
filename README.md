# Taquilla

Plataforma propia de venta de entradas de Grupo Livon / ProCreArtes para festivales, teatro, conciertos, magia y humor, pensada para Canarias y España y lista para marca blanca (ayuntamientos, cabildos, teatros y promotores).

> **Entorno de pruebas.** Nada está en producción. Pagos solo en modo prueba (o con la pasarela simulada). ASOMBRA 2026 se sigue vendiendo en Entradas Canarias; aquí solo hay datos de prueba para comprar.

## Arrancar (un solo comando)

Necesitas [Node.js 22 o superior](https://nodejs.org).

```bash
npm install
npm run demo
```

Abre http://localhost:3000. Detalles, compra de prueba y todo lo demás en **[docs/ESTADO.md](docs/ESTADO.md)** → «Para Naroe».

Con Docker (PostgreSQL, Redis y Mailpit reales): `docker compose up --build` → web en http://localhost:3000 y correos en http://localhost:8025.

## Documentación

| Documento | Qué cuenta |
|---|---|
| [ESTADO.md](docs/ESTADO.md) | Qué está hecho, qué es demostración, qué falta y cómo probarlo. **Empieza aquí.** |
| [ARQUITECTURA.md](docs/ARQUITECTURA.md) | Cómo está construida |
| [DECISIONES.md](docs/DECISIONES.md) | Decisiones tomadas y cómo cambiarlas |
| [PAGOS.md](docs/PAGOS.md) | Stripe Connect en modo prueba |
| [ENTRADAS.md](docs/ENTRADAS.md) | QR, PDF, puerta sin conexión, monederos |
| [INTEGRACIONES.md](docs/INTEGRACIONES.md) | Webhooks para n8n, widget «Comprar», idiomas |
| [SEGURIDAD.md](docs/SEGURIDAD.md) | Revisión OWASP y capas de seguridad |
| [CARGA.md](docs/CARGA.md) | Prueba de carga |
| [COPIAS.md](docs/COPIAS.md) | Copias de seguridad |

## Material de partida

- `PROMPT.md` y `CLAUDE.md`: encargo y reglas del proyecto.
- `referencia/prototipo-taquilla.html`: prototipo validado.
- `datos/`: programación de ASOMBRA 2026 y planos de Puerto del Rosario y Antigua.
- `referencia/planos-pdf/`: planos técnicos oficiales.

## Desarrollo

```bash
npm test          # tests (PGlite en memoria)
npm run typecheck # tipos
```

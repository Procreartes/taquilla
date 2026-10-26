# Taquilla — plataforma propia de venta de entradas

Las instrucciones completas están en `PROMPT.md`. Léelo al empezar cada sesión, junto con `docs/ESTADO.md` y `docs/DECISIONES.md` si ya existen.

## Reglas que no se rompen

- **Trabaja de forma autónoma.** No te pares a preguntar: decide lo razonable, apúntalo en `docs/DECISIONES.md` y sigue.
- **Producción (desde el 26/10/2026)**: entradas.grupolivon.com en Coolify con `docker-compose.prod.yml`. No se despliega a producción sin que Naroe lo apruebe; los cambios van en rama y PR.
- **Stripe**: cobro real solo con `COBRO_REAL=true` y `NODE_ENV=production`. Ninguna clave ni secreto real en el repo: los pone Naroe en Coolify.
- **Sin sobreventa**: toda venta de butaca pasa por la reserva atómica; los tests de concurrencia deben pasar siempre.
- **No inventes datos reales**: lo que falte se muestra como pendiente; lo de prueba se marca como de prueba.
- **No toques otros repos** ni la venta oficial en Entradas Canarias.
- **Correos**: en local, al capturador; en producción, por el Microsoft 365 configurado en Coolify.
- **Accesibilidad WCAG 2.2 AA** y móvil primero.
- Los datos de cada organizador nunca se mezclan con los de otro.

## Al cerrar cada fase

- Tests en verde, commit, PR a `main` con resumen y merge.
- Actualiza `docs/ESTADO.md`: terminado, demostración, pendiente de datos o claves reales, y cómo probarlo paso a paso en lenguaje sencillo.

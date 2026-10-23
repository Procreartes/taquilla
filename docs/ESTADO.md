# Estado de Taquilla

> Qué está hecho, qué es solo demostración, qué espera datos o claves reales y cómo probar cada cosa. Se actualiza al cerrar cada fase.

## Resumen por fases

| Fase | Estado |
|---|---|
| 1 · Base | ✅ Terminada |
| 2 · Planos | ⏳ Pendiente |
| 3 · Eventos y funciones | ⏳ Pendiente |
| 4 · Compra | ⏳ Pendiente |
| 5 · Entradas y puerta | ⏳ Pendiente |
| 6 · Panel y dinero | ⏳ Pendiente |
| 7 · Seguridad y carga | ⏳ Pendiente |
| 8 · Integraciones y acabado | ⏳ Pendiente |

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

## Para Naroe

*(Se completa al final de todas las fases.)*

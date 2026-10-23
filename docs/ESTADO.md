# Estado de Taquilla

> Qué está hecho, qué es solo demostración, qué espera datos o claves reales y cómo probar cada cosa. Se actualiza al cerrar cada fase.

## Resumen por fases

| Fase | Estado |
|---|---|
| 1 · Base | ✅ Terminada |
| 2 · Planos | ✅ Terminada |
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

## Para Naroe

*(Se completa al final de todas las fases.)*

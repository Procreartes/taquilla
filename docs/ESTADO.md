# Estado de Taquilla

> Qué está hecho, qué es solo demostración, qué espera datos o claves reales y cómo probar cada cosa. Se actualiza al cerrar cada fase.

## Resumen por fases

| Fase | Estado |
|---|---|
| 1 · Base | ✅ Terminada |
| 2 · Planos | ✅ Terminada |
| 3 · Eventos y funciones | ✅ Terminada |
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

## Para Naroe

*(Se completa al final de todas las fases.)*

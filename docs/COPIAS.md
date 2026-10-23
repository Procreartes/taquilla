# Copias de seguridad

**Estado:** scripts preparados, sin credenciales y sin programar (no hay nada en producción todavía).

## Qué se copia

La base de datos PostgreSQL completa (organizadores, planos, funciones, pedidos, entradas, auditoría…). Redis no se copia: solo guarda reservas de 10 minutos y la cola virtual, que se regeneran solas.

## Cómo (cuando se despliegue en el VPS de OVHcloud)

1. En el servidor instalar `postgresql-client`, `rclone` y `age`.
2. Generar una pareja de claves de cifrado **en un ordenador de confianza** (no en el servidor):
   ```bash
   age-keygen -o clave-copias-taquilla.txt
   ```
   La línea `public key: age1…` es `AGE_DESTINATARIO` (va al servidor). El fichero completo es la clave privada: guardarla en el gestor de contraseñas y en papel en un sitio seguro. **Sin ella no se pueden recuperar las copias.**
3. Configurar `rclone` en el servidor (`rclone config`):
   - `b2`: tipo Backblaze B2, con una *application key* que solo pueda escribir en un bucket `taquilla-copias` con **Object Lock** (las copias no se pueden borrar durante 30 días aunque alguien entre en el servidor).
   - `nas`: tipo SFTP hacia el Synology (usuario específico solo con acceso a `/copias/taquilla`).
4. Programar cada noche (Coolify → *Scheduled Tasks*, o cron):
   ```bash
   DATABASE_URL=… AGE_DESTINATARIO=age1… RCLONE_B2=b2:taquilla-copias/postgres RCLONE_NAS=nas:/copias/taquilla ./scripts/copias/copia.sh
   ```
5. **Probar la restauración una vez al mes** en una base de datos de prueba:
   ```bash
   DESTINO_DATABASE_URL=postgres://…/taquilla_prueba AGE_IDENTIDAD=clave-copias-taquilla.txt ./scripts/copias/restaurar.sh copia.dump.age
   ```

## Retención recomendada

| Dónde | Cuánto |
|---|---|
| Servidor | 7 días |
| Backblaze B2 | 90 días (regla de ciclo de vida del bucket) con Object Lock de 30 días |
| NAS Synology | 1 año (Hyper Backup / instantáneas del NAS) |

## Objetivos

- Pérdida máxima de datos: 24 h (copia diaria). Si hace falta menos, activar en PostgreSQL el archivado continuo (WAL) con `pgBackRest` o `wal-g` hacia B2.
- Tiempo de recuperación: < 1 h con el script de restauración.

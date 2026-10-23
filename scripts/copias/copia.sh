#!/usr/bin/env bash
# Copia de seguridad de la base de datos de Taquilla.
#
# Hace un volcado de PostgreSQL, lo cifra (si hay clave pública de «age») y lo sube a
# Backblaze B2 y al NAS Synology con rclone. Pensado para ejecutarse cada noche en el VPS
# (cron o tarea programada de Coolify). NO contiene credenciales: todo va en variables de entorno
# y en la configuración de rclone (~/.config/rclone/rclone.conf), que se crea a mano en el servidor.
#
# Variables:
#   DATABASE_URL            postgres://usuario:clave@host:5432/taquilla   (obligatoria)
#   CARPETA_COPIAS          carpeta local para las copias (por defecto ./copias)
#   AGE_DESTINATARIO        clave pública age (age1…) para cifrar; sin ella la copia NO se sube
#   RCLONE_B2               destino rclone en Backblaze B2, p. ej. b2:taquilla-copias/postgres
#   RCLONE_NAS              destino rclone en el Synology, p. ej. nas:/copias/taquilla
#   DIAS_LOCALES            días que se guardan en local (por defecto 7)
set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL}"
CARPETA="${CARPETA_COPIAS:-./copias}"
DIAS="${DIAS_LOCALES:-7}"
FECHA="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$CARPETA"
FICHERO="$CARPETA/taquilla-$FECHA.dump"

echo "[$(date -u +%FT%TZ)] Volcando la base de datos…"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$FICHERO" "$DATABASE_URL"
pg_restore --list "$FICHERO" > /dev/null   # comprobación: el volcado se puede leer

if [[ -n "${AGE_DESTINATARIO:-}" ]]; then
  age --recipient "$AGE_DESTINATARIO" --output "$FICHERO.age" "$FICHERO"
  rm -f "$FICHERO"
  FICHERO="$FICHERO.age"
else
  echo "AVISO: sin AGE_DESTINATARIO la copia queda solo en local y sin cifrar (no se sube a ningún sitio)." >&2
fi
sha256sum "$FICHERO" > "$FICHERO.sha256"

if [[ "$FICHERO" == *.age ]]; then
  for destino in "${RCLONE_B2:-}" "${RCLONE_NAS:-}"; do
    [[ -z "$destino" ]] && continue
    echo "Subiendo a $destino…"
    rclone copy --immutable "$FICHERO" "$destino"
    rclone copy "$FICHERO.sha256" "$destino"
  done
fi

find "$CARPETA" -name 'taquilla-*' -type f -mtime +"$DIAS" -delete
echo "[$(date -u +%FT%TZ)] Copia terminada: $FICHERO"

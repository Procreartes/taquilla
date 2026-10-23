#!/usr/bin/env bash
# Restaura una copia de Taquilla en una base de datos (por defecto, una de PRUEBA).
#
#   ./scripts/copias/restaurar.sh copias/taquilla-20261101T030000Z.dump.age
#
# Variables:
#   DESTINO_DATABASE_URL   base de datos donde restaurar (obligatoria; NUNCA la de producción sin pensarlo dos veces)
#   AGE_IDENTIDAD          fichero con la clave privada age (si la copia está cifrada)
set -euo pipefail

COPIA="${1:?Indica el fichero de copia}"
: "${DESTINO_DATABASE_URL:?Falta DESTINO_DATABASE_URL}"

if [[ -f "$COPIA.sha256" ]]; then sha256sum --check "$COPIA.sha256"; fi
if [[ "$COPIA" == *.age ]]; then
  : "${AGE_IDENTIDAD:?La copia está cifrada: falta AGE_IDENTIDAD}"
  TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
  age --decrypt --identity "$AGE_IDENTIDAD" --output "$TMP" "$COPIA"
  COPIA="$TMP"
fi
read -r -p "Se va a SOBRESCRIBIR la base de datos de destino. Escribe RESTAURAR para seguir: " ok
[[ "$ok" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DESTINO_DATABASE_URL" "$COPIA"
echo "Restaurada. Comprueba: psql \"\$DESTINO_DATABASE_URL\" -c 'select count(*) from pedidos'"

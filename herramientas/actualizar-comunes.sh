#!/bin/sh
# Copia las piezas compartidas desde la app Gastos (../gastos-app), que es la fuente original.
# Úsalo después de cambiar cifrado, sincronización o configuración del hogar en Gastos.
set -e
cd "$(dirname "$0")/.."
G=../gastos-app
for f in js/crypto.js js/common.js js/sync.js js/setup.js config.js vendor/supabase.js; do cp "$G/$f" "$f"; echo "copiado $f"; done

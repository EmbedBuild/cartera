#!/usr/bin/env bash
# Publica Cartera en github.com/EmbedBuild/cartera y abre los cinco retos como incidencias.
# Se lanza una vez, en clase: ./publicar.sh   (necesita `gh auth login` con permiso en la organización EmbedBuild)
set -euo pipefail
cd "$(dirname "$0")"

REPO="EmbedBuild/cartera"

gh repo create "$REPO" --public --source . --remote origin --push \
  --description "Cartera: la herramienta de presupuestos de la comunidad PotenzIA. Una API, la entrada con correo y un MCP para llevarla hablando desde Claude."

gh label create reto --repo "$REPO" --color D9B444 --description "Reto para la comunidad"

for reto in retos/0*.md; do
  titulo="$(head -n 1 "$reto" | sed 's/^# //')"
  gh issue create --repo "$REPO" --title "$titulo" --body-file "$reto" --label reto
done

echo "Listo: https://github.com/$REPO"

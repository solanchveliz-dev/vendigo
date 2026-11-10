#!/usr/bin/env bash
# Actualiza VendiGo en el servidor: trae la rama indicada, reconstruye y reinicia.
# Las migraciones de la base corren solas cuando arranca la API.
# Uso: ./deploy/desplegar.sh [rama]   (por defecto main)
set -euo pipefail
cd "$(dirname "$0")/.."

rama="${1:-main}"
if [ ! -f deploy/.env ]; then
  echo "Falta deploy/.env (cópialo de deploy/.env.ejemplo y complétalo)." >&2
  exit 1
fi

git fetch --quiet origin "$rama"
git checkout --quiet "$rama"
git reset --quiet --hard "origin/$rama"

cd deploy
docker compose build
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

# Espera a que la API responda antes de dar por terminado el despliegue
for i in $(seq 1 30); do
  if docker compose exec -T web wget -qO- http://api:8080/salud >/dev/null 2>&1; then
    echo "VendiGo actualizado ($(git rev-parse --short HEAD))."
    exit 0
  fi
  sleep 2
done
echo "La API no respondió. Revisa: docker compose -f deploy/docker-compose.yml logs api" >&2
exit 1

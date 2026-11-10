#!/usr/bin/env bash
# Se ejecuta UNA vez en la instancia EC2 nueva (Amazon Linux 2023): instala Docker y agrega memoria de intercambio,
# porque construir la web con 1 GB de RAM no alcanza.
set -euo pipefail

sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Docker Compose v2 como complemento de Docker
sudo mkdir -p /usr/local/lib/docker/cli-plugins
arq=$(uname -m)
sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${arq}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 2 GB de swap
if ! swapon --show | grep -q /swapfile; then
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
fi

echo "Listo. Cierra la sesión SSH y vuelve a entrar para usar docker sin sudo."

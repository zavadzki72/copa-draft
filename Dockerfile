# Copa Draft — site estático servido por nginx.
# Não há build: copiamos os assets do jogo direto para o nginx.
FROM nginx:1.27-alpine

# Config do nginx (cache de assets + fallback pro index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Apenas os arquivos que o index.html realmente carrega.
WORKDIR /usr/share/nginx/html
COPY index.html config.js game.css app.jsx manifest.webmanifest ./
COPY lib/    ./lib/
COPY ui/     ./ui/
COPY data/   ./data/
COPY styles/ ./styles/
COPY images/ ./images/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

# Copa Draft — front com build de produção (esbuild) servido por nginx.
# O dev continua sem build (Babel no navegador); a transpilação dos .jsx
# e a troca para o React de produção acontecem aqui, via build.mjs.
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm i --no-save --no-audit --no-fund esbuild@0.25 && node build.mjs

FROM nginx:1.27-alpine

# Config do nginx (cache de assets + fallback pro index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist ./

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

# E2E multiplayer (stack real)

Simula 2 jogadores com o cliente SignalR oficial contra `localhost:8090`
e valida o fluxo do pré-jogo/ready-gate nas rodadas 1→3.

```bash
docker compose up -d            # stack no ar
cd tools/e2e && npm i @microsoft/signalr@8 && cp ../../squads.json .
# crie 2 convidados + sala direto no banco e rode (ver bloco no histórico
# do PLAN_004 ou adapte): TOKEN_A/B, USER_A/B e CODE via env
node e2e-mp.mjs
```

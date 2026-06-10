# E2E multiplayer (stack real)

Simula 2 jogadores com o cliente SignalR oficial contra `localhost:8090` e
cobre o fluxo completo: lobby+velocidade, draft (com reservas), ready-gate,
skip de rodada, torneio até o campeão, espectador de eliminado e revanche —
com checagem de mecânicas (cartões/lesões/pênaltis) nos logs reais.

```bash
docker compose up -d                       # stack no ar
cd tools/e2e && npm i @microsoft/signalr@8 && cd ../..
bash tools/e2e/run.sh                      # cria convidados+sala e roda tudo
```

O runner cria 2 convidados via API e a sala direto no Postgres (convidado não
cria sala pela API — restrição de produto), roda as ~26 verificações e limpa
as salas `E2E*` ao final. Saída esperada: `✅ E2E COMPLETO`.

#!/usr/bin/env bash
# ============================================================
# E2E multiplayer contra a stack real — runner completo.
# Pré-requisitos:
#   docker compose up -d            (stack no ar em localhost:8090)
#   cd tools/e2e && npm i @microsoft/signalr@8
# Uso:  bash tools/e2e/run.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/../.."   # raiz do repo

cp squads.json tools/e2e/squads.json

# 2 convidados reais via API
RA=$(curl -s -X POST http://localhost:8090/api/auth/guest -H 'Content-Type: application/json' -d '{"name":"E2E Anfitriao"}')
RB=$(curl -s -X POST http://localhost:8090/api/auth/guest -H 'Content-Type: application/json' -d '{"name":"E2E Convidado"}')
export TOKEN_A=$(echo "$RA" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
export USER_A=$(echo "$RA" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])")
export TOKEN_B=$(echo "$RB" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
export USER_B=$(echo "$RB" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])")

# convidado não cria sala via API — cria direto no banco (só para teste)
export CODE=E2E$(openssl rand -hex 2 | tr 'a-f' 'A-F' | head -c 3)
RID=$(python3 -c "import uuid;print(uuid.uuid4())")
PID=$(python3 -c "import uuid;print(uuid.uuid4())")
docker compose exec -T db psql -U copadraft -d copadraft -c \
 "INSERT INTO \"Rooms\" (\"Id\",\"Code\",\"HostUserId\",\"State\",\"Seed\",\"MaxPlayers\",\"CreatedAt\",\"Speed\")
    VALUES ('$RID','$CODE','$USER_A',0,$RANDOM$RANDOM,8,now(),'rapido');
  INSERT INTO \"Participants\" (\"Id\",\"RoomId\",\"UserId\",\"IsHost\",\"Presence\",\"Ready\",\"JoinOrder\",\"JoinedAt\")
    VALUES ('$PID','$RID','$USER_A',true,0,false,0,now());" >/dev/null

echo "sala $CODE — rodando E2E completo (~70s)..."
node tools/e2e/e2e-mp.mjs
STATUS=$?

# limpeza das salas de teste
docker compose exec -T db psql -U copadraft -d copadraft -c "
DELETE FROM \"Teams\" WHERE \"ParticipantId\" IN (SELECT \"Id\" FROM \"Participants\" WHERE \"RoomId\" IN (SELECT \"Id\" FROM \"Rooms\" WHERE \"Code\" LIKE 'E2E%'));
DELETE FROM \"Tournaments\" WHERE \"RoomId\" IN (SELECT \"Id\" FROM \"Rooms\" WHERE \"Code\" LIKE 'E2E%');
DELETE FROM \"Participants\" WHERE \"RoomId\" IN (SELECT \"Id\" FROM \"Rooms\" WHERE \"Code\" LIKE 'E2E%');
DELETE FROM \"Rooms\" WHERE \"Code\" LIKE 'E2E%';" >/dev/null
exit $STATUS

#!/usr/bin/env bash
# AgentSkiller launcher.
#   ./run.sh          dev mode: API on 4280, UI with hot reload on 5273
#   ./run.sh prod     build everything, serve API + UI from one process on 4280
#   ./run.sh stop     stop what this script started
#   ./run.sh status   show what is running
#   ./run.sh mcp      print the MCP connection details
set -euo pipefail
cd "$(dirname "$0")"

PORT="${SKILLER_PORT:-4280}"
WEB_PORT="${WEB_PORT:-5273}"
PID_DIR=".skiller"
mkdir -p "$PID_DIR"

need_install() {
  [ ! -d node_modules ] || [ ! -d packages/core/dist ]
}

port_holder() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1" (pid "$2")"}'
}

refuse_if_taken() {
  local holder
  holder="$(port_holder "$1" || true)"
  if [ -n "$holder" ]; then
    echo "Port $1 is already used by $holder. Stop it or set SKILLER_PORT / WEB_PORT." >&2
    exit 1
  fi
}

wait_for_health() {
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "The API did not answer on port $PORT." >&2
  return 1
}

case "${1:-dev}" in
  dev)
    refuse_if_taken "$PORT"
    refuse_if_taken "$WEB_PORT"
    if need_install; then npm install && npm run build -w @agent-skiller/core; fi
    npm run build -w @agent-skiller/core >/dev/null
    (npm run dev -w server > "$PID_DIR/server.log" 2>&1 & echo $! > "$PID_DIR/server.pid")
    wait_for_health
    (WEB_PORT="$WEB_PORT" npm run dev -w web > "$PID_DIR/web.log" 2>&1 & echo $! > "$PID_DIR/web.pid")
    echo "UI:  http://localhost:$WEB_PORT"
    echo "API: http://127.0.0.1:$PORT   MCP: http://127.0.0.1:$PORT/mcp"
    echo "Logs in $PID_DIR/. Stop with ./run.sh stop"
    ;;
  prod)
    refuse_if_taken "$PORT"
    if need_install; then npm install; fi
    npm run build
    (npm run start -w server > "$PID_DIR/server.log" 2>&1 & echo $! > "$PID_DIR/server.pid")
    wait_for_health
    echo "AgentSkiller: http://127.0.0.1:$PORT   MCP: http://127.0.0.1:$PORT/mcp"
    ;;
  stop)
    for name in web server; do
      if [ -f "$PID_DIR/$name.pid" ]; then
        pid="$(cat "$PID_DIR/$name.pid")"
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
        rm -f "$PID_DIR/$name.pid"
        echo "stopped $name"
      fi
    done
    ;;
  status)
    echo "API port $PORT: $(port_holder "$PORT" || echo free)"
    echo "UI  port $WEB_PORT: $(port_holder "$WEB_PORT" || echo free)"
    ;;
  mcp)
    cat <<MSG
HTTP (server must be running):  http://127.0.0.1:$PORT/mcp
  Add it to any MCP client as a streamable-HTTP server, for example:
  {"mcpServers":{"agent-skiller":{"url":"http://127.0.0.1:$PORT/mcp"}}}

stdio (no server needed, same workspace folder):
  {"mcpServers":{"agent-skiller":{"command":"node","args":["$(pwd)/server/dist/mcp-stdio.js"]}}}
MSG
    ;;
  *)
    echo "usage: ./run.sh [dev|prod|stop|status|mcp]" >&2
    exit 1
    ;;
esac

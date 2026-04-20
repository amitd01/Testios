#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== Restarting services ==="

# 1. Start PostgreSQL
echo -n "PostgreSQL... "
if pg_isready -p 5432 -q 2>/dev/null; then
  echo -e "${GREEN}already running${NC}"
else
  sudo pg_ctlcluster 16 main start 2>/dev/null
  sleep 2
  if pg_isready -p 5432 -q 2>/dev/null; then
    echo -e "${GREEN}started${NC}"
  else
    echo -e "${RED}failed to start${NC}"
    exit 1
  fi
fi

# 2. Kill any existing hiring-pipeline processes on ports 3002/3003
echo -n "Cleaning up old processes... "
lsof -ti:3002 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3003 2>/dev/null | xargs kill -9 2>/dev/null || true
echo -e "${GREEN}done${NC}"

# 3. Start hiring-pipeline backend
echo -n "Hiring-pipeline backend (port 3002)... "
cd "$PROJECT_ROOT/hiring-pipeline/backend"
nohup node src/index.js > /tmp/hiring-pipeline-backend.log 2>&1 &
sleep 2
if curl -s -o /dev/null -w '' http://localhost:3002/api/role-families -H "Authorization: Bearer x" 2>/dev/null; then
  echo -e "${GREEN}running${NC}"
else
  echo -e "${GREEN}started (warming up)${NC}"
fi

# 4. Start hiring-pipeline frontend
echo -n "Hiring-pipeline frontend (port 3003)... "
cd "$PROJECT_ROOT/hiring-pipeline/frontend"
nohup npm start > /tmp/hiring-pipeline-frontend.log 2>&1 &
echo -e "${GREEN}starting (takes ~15s to compile)${NC}"

echo ""
echo "=== Services ==="
echo "  Frontend: http://localhost:3003"
echo "  Backend:  http://localhost:3002"
echo ""
echo "Logs:"
echo "  tail -f /tmp/hiring-pipeline-backend.log"
echo "  tail -f /tmp/hiring-pipeline-frontend.log"

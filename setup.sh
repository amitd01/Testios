#!/bin/bash
set -e

# ============================================================
# PFM India — One-command local setup
# Run: chmod +x setup.sh && ./setup.sh
# ============================================================

echo "==========================================="
echo "  PFM India — Local Setup"
echo "==========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check prerequisites
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗ $1 is not installed.${NC} $2"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} $1 found"
}

echo "Checking prerequisites..."
check_cmd node "Install from https://nodejs.org (v18+)"
check_cmd npm "Comes with Node.js"
check_cmd psql "Install PostgreSQL: brew install postgresql (Mac) or sudo apt install postgresql (Linux)"
check_cmd redis-cli "Install Redis: brew install redis (Mac) or sudo apt install redis-server (Linux)"

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}✗ Node.js v18+ required (found v$(node -v))${NC}"
  exit 1
fi
echo ""

# ---- Environment setup ----
if [ ! -f backend/.env ]; then
  echo -e "${YELLOW}Setting up environment...${NC}"

  # Check for Google OAuth credentials
  if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo ""
    echo "Google OAuth credentials needed."
    echo "Get them from: https://console.cloud.google.com/apis/credentials"
    echo ""
    read -p "Google Client ID: " GOOGLE_CLIENT_ID
    read -p "Google Client Secret: " GOOGLE_CLIENT_SECRET
  fi

  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  cat > backend/.env << EOF
# Google OAuth
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
REDIRECT_URI=http://localhost:3001/auth/google/callback

# Database
DATABASE_URL=postgresql://pfm_user:pfm_pass@localhost:5432/pfm_india

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=${JWT_SECRET}

# Encryption (AES-256 key for OAuth refresh tokens)
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Server
PORT=3001
NODE_ENV=development

# Email Sync
EMAIL_SYNC_INTERVAL=3600
INITIAL_SCAN_DAYS=90

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
EOF

  echo -e "${GREEN}✓${NC} backend/.env created"
else
  echo -e "${GREEN}✓${NC} backend/.env already exists"
fi
echo ""

# ---- Database setup ----
echo "Setting up PostgreSQL database..."

# Check if database exists
if psql -h localhost -U pfm_user -d pfm_india -c "SELECT 1" &>/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Database pfm_india already exists"
else
  echo "Creating database user and database..."
  # Try with sudo (Linux) or without (Mac with default config)
  if command -v sudo &>/dev/null && sudo -u postgres psql -c "SELECT 1" &>/dev/null 2>&1; then
    sudo -u postgres psql -c "CREATE USER pfm_user WITH PASSWORD 'pfm_pass';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE pfm_india OWNER pfm_user;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE pfm_india TO pfm_user;" 2>/dev/null || true
  else
    createuser pfm_user 2>/dev/null || true
    psql -c "ALTER USER pfm_user WITH PASSWORD 'pfm_pass';" 2>/dev/null || true
    createdb -O pfm_user pfm_india 2>/dev/null || true
  fi
  echo -e "${GREEN}✓${NC} Database created"
fi
echo ""

# ---- Install dependencies ----
echo "Installing dependencies..."
cd backend && npm install --silent && cd ..
echo -e "${GREEN}✓${NC} Backend dependencies installed"
cd frontend && npm install --silent && cd ..
echo -e "${GREEN}✓${NC} Frontend dependencies installed"
echo ""

# ---- Run migrations ----
echo "Running database migrations..."
cd backend && node src/migrations/run.js up && cd ..
echo ""

# ---- Start services ----
echo "==========================================="
echo "  Starting PFM India"
echo "==========================================="
echo ""

# Start Redis if not running
if ! redis-cli ping &>/dev/null 2>&1; then
  echo "Starting Redis..."
  redis-server --daemonize yes
fi
echo -e "${GREEN}✓${NC} Redis running"

# Start backend
echo "Starting backend on port 3001..."
cd backend && node src/index.js &
BACKEND_PID=$!
cd ..

# Wait for backend
for i in $(seq 1 10); do
  if curl -s http://localhost:3001/health &>/dev/null; then
    break
  fi
  sleep 1
done
echo -e "${GREEN}✓${NC} Backend running at http://localhost:3001"

# Start frontend
echo "Starting frontend on port 3000..."
cd frontend && PORT=3000 npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "==========================================="
echo -e "  ${GREEN}PFM India is starting up!${NC}"
echo "==========================================="
echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001"
echo ""
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Click 'Get Started with Gmail'"
echo "  3. Sign in with your Google account"
echo "  4. The app will scan your last 90 days of emails"
echo ""
echo -e "  ${YELLOW}Make sure your Gmail is added as a Test User${NC}"
echo "  in Google Cloud Console → OAuth consent screen"
echo ""
echo "  Press Ctrl+C to stop all services"

# Cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Wait for processes
wait

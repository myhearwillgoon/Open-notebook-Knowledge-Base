#!/bin/sh
# Open Notebook - From Zero Startup Script (Linux/Mac)
# Prerequisites: Docker installed and running
# Usage: ./scripts/start-open-notebook.sh
#        ./scripts/start-open-notebook.sh --build   # Build from local source
#        ./scripts/start-open-notebook.sh --open    # Open browser when ready

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

BUILD_FROM_SOURCE=false
OPEN_BROWSER=false
for arg in "$@"; do
  case $arg in
    --build) BUILD_FROM_SOURCE=true ;;
    --open) OPEN_BROWSER=true ;;
  esac
done

echo ""
echo "========================================"
echo "  Open Notebook - From Zero Startup"
echo "========================================"
echo ""

# Step 1: Check Docker
echo "[1/5] Checking Docker..."
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "  ERROR: Docker is required but not found or not running."
  echo ""
  echo "  Install: https://docs.docker.com/get-docker/"
  exit 1
fi
echo "  OK: Docker is installed and running"

# Step 2: Ensure encryption key
echo ""
echo "[2/5] Checking encryption key..."
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ] || grep -q "change-me-to-a-secret-string" "$ENV_FILE" 2>/dev/null; then
  SECRET=$(openssl rand -hex 16 2>/dev/null || awk 'BEGIN{srand();for(i=0;i<32;i++)printf "%c",97+int(26*rand())}')
  if [ -f "$ENV_FILE" ] && grep -q "^OPEN_NOTEBOOK_ENCRYPTION_KEY=" "$ENV_FILE" 2>/dev/null; then
    # Replace existing key (portable: works on BSD/macOS and GNU)
    grep -v "^OPEN_NOTEBOOK_ENCRYPTION_KEY=" "$ENV_FILE" > "${ENV_FILE}.tmp"
    echo "OPEN_NOTEBOOK_ENCRYPTION_KEY=$SECRET" >> "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    echo "OPEN_NOTEBOOK_ENCRYPTION_KEY=$SECRET" >> "$ENV_FILE"
  fi
  echo "  OK: Generated and saved encryption key to .env"
else
  echo "  OK: Encryption key already configured"
fi

# Step 3: Create data directories
echo ""
echo "[3/5] Creating data directories..."
mkdir -p surreal_data notebook_data
echo "  OK: Directories ready"

# Step 4: Start Docker
echo ""
echo "[4/5] Starting Open Notebook..."
if [ "$BUILD_FROM_SOURCE" = true ]; then
  echo "  Building from source (2-5 minutes)..."
  docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
else
  echo "  Using pre-built image from Docker Hub..."
  docker compose -f docker-compose.standalone.yml up -d
fi
echo "  OK: Containers started"

# Step 5: Wait for readiness
echo ""
echo "[5/5] Waiting for services (about 20 seconds)..."
READY=false
WAITED=0
MAX_WAIT=60
while [ $WAITED -lt $MAX_WAIT ]; do
  sleep 3
  WAITED=$((WAITED + 3))
  if curl -sf http://localhost:5055/health >/dev/null 2>&1; then
    READY=true
    break
  fi
  echo "  ... ${WAITED}s"
done
if [ "$READY" = true ]; then
  echo "  OK: Open Notebook is ready!"
else
  echo "  WARN: API not ready yet. Try http://localhost:8502 in a minute."
fi

# Summary
echo ""
echo "========================================"
echo "  Open Notebook is running"
echo "========================================"
echo ""
echo "  Web UI:   http://localhost:8502"
echo "  API:      http://localhost:5055"
echo "  API Docs: http://localhost:5055/docs"
echo ""
echo "  Configure AI: Settings -> API Keys -> Add Credential"
echo "  Stop: docker compose -f docker-compose.standalone.yml down"
echo ""

if [ "$OPEN_BROWSER" = true ] && [ "$READY" = true ]; then
  (xdg-open http://localhost:8502 2>/dev/null || open http://localhost:8502 2>/dev/null || true) &
  echo "  Opened browser."
fi

#!/bin/bash
set -e

echo "=== Deploying ContainerTrans ==="

# 1. Pull latest code
cd /home/ubuntuuser/ct-app
echo "[1/6] Pulling latest code..."
git pull origin main 2>&1 | tail -5

# 2. Install dependencies
echo "[2/6] Installing dependencies..."
npm install --legacy-peer-deps 2>&1 | tail -3

# 3. Build Next.js
echo "[3/6] Building Next.js..."
npm run build 2>&1 | tail -10

# 4. Build docker image
echo "[4/6] Docker build..."
docker build -t ct-app . 2>&1 | tail -5

# 5. Create new container on both networks
echo "[5/6] Creating new container..."
docker rm -f ct-app-new 2>/dev/null || true
docker create --name ct-app-new \
  -p 8080:8080 \
  -e DATABASE_URL="postgresql://containertrans:CTsecure2026db!@ct-postgres:5432/containertrans" \
  -e DIRECT_URL="postgresql://containertrans:CTsecure2026db!@ct-postgres:5432/containertrans" \
  -e NEXTAUTH_URL="https://artliss.mooo.com" \
  -e NEXTAUTH_SECRET="#vEEhTXQm!0NyPtulRVrrysoSfRdmJWmGqXMaayISa16LHm%oTJabDpSlHbFH2sF" \
  -e NODE_ENV="production" \
  -e DADATA_TOKEN="6de258b48391b3a55a99bfa7fdf28815ae7393a2" \
  --restart unless-stopped \
  ct-app

# Connect to ct-network for DNS resolution
docker network connect ct-network ct-app-new 2>/dev/null || true
# Connect to dokploy-network for Dokploy compatibility
docker network connect dokploy-network ct-app-new 2>/dev/null || true

# 6. Quick swap: stop old, start new (minimize downtime)
echo "[6/6] Swapping containers..."
docker stop ct-app 2>/dev/null || true
docker rm ct-app 2>/dev/null || true
docker rename ct-app-new ct-app
docker start ct-app

echo "=== Done! ==="
docker ps --format '{{.Names}} {{.Status}}' | grep ct-app

#!/bin/bash
# Deploy Production Calendar feature to ContainerTrans
# Run this script on the VPS: bash deploy-production-calendar.sh
# Usage: bash deploy-production-calendar.sh [path-to-local-files]

set -e

CT_DIR="/home/ubuntuuser/ct-app"
LOCAL_SRC="${1:-.}"

echo "=== Deploying Production Calendar Feature ==="

# 1. Create necessary directories
echo "[1/6] Creating directories..."
mkdir -p "$CT_DIR/src/app/api/production-calendar/sync-online"
mkdir -p "$CT_DIR/src/components"

# 2. Copy server-side library files
echo "[2/6] Copying library files..."
if [ -f "$LOCAL_SRC/src/lib/production-calendar.ts" ]; then
  cp "$LOCAL_SRC/src/lib/production-calendar.ts" "$CT_DIR/src/lib/production-calendar.ts"
  echo "  - production-calendar.ts"
fi

# 3. Copy API routes
echo "[3/6] Copying API routes..."
for f in route.ts; do
  if [ -f "$LOCAL_SRC/src/app/api/production-calendar/$f" ]; then
    cp "$LOCAL_SRC/src/app/api/production-calendar/$f" "$CT_DIR/src/app/api/production-calendar/$f"
    echo "  - production-calendar/$f"
  fi
done

for dir in batch days recalculate sync-online; do
  if [ -f "$LOCAL_SRC/src/app/api/production-calendar/$dir/route.ts" ]; then
    cp "$LOCAL_SRC/src/app/api/production-calendar/$dir/route.ts" "$CT_DIR/src/app/api/production-calendar/$dir/route.ts"
    echo "  - production-calendar/$dir/route.ts"
  fi
done

# 4. Copy UI component
echo "[4/6] Copying UI component..."
if [ -f "$LOCAL_SRC/src/components/ProductionCalendarTab.tsx" ]; then
  cp "$LOCAL_SRC/src/components/ProductionCalendarTab.tsx" "$CT_DIR/src/components/ProductionCalendarTab.tsx"
  echo "  - ProductionCalendarTab.tsx"
fi

# 5. Copy updated payment-calendar page
echo "[5/6] Copying updated payment-calendar page..."
if [ -f "$LOCAL_SRC/src/app/(dashboard)/payment-calendar/page.tsx" ]; then
  cp "$LOCAL_SRC/src/app/(dashboard)/payment-calendar/page.tsx" "$CT_DIR/src/app/(dashboard)/payment-calendar/page.tsx"
  echo "  - payment-calendar/page.tsx"
fi

# 6. Copy updated Prisma schema
echo "[6/6] Copying Prisma schema..."
if [ -f "$LOCAL_SRC/prisma/schema.prisma" ]; then
  cp "$LOCAL_SRC/prisma/schema.prisma" "$CT_DIR/prisma/schema.prisma"
  echo "  - schema.prisma"
fi

echo ""
echo "=== Files deployed. Now rebuilding container... ==="

cd "$CT_DIR"

# Generate Prisma client
echo "Running prisma generate..."
docker exec ct-app npx prisma generate 2>&1 | tail -5

# Rebuild and restart the container
echo "Rebuilding container..."
bash /home/ubuntuuser/deploy-ct.sh 2>&1 | tail -20

echo ""
echo "=== Deployment complete! ==="
echo "Check: https://195.209.208.114/payment-calendar"
echo "Admin tab 'Производственный календарь' should be visible."

#!/bin/bash
# === SERVER-SIDE DEPLOYMENT SCRIPT ===
# Run this script DIRECTLY on the VPS server
# It will:
# 1. Add ProductionCalendar model to Prisma schema
# 2. Mark the migration as applied (table already exists in DB)
# 3. Generate Prisma client
# 4. Deploy the app
#
# Usage: bash deploy-pc.sh
set -e

APP_DIR="/home/ubuntuuser/ct-app"
SCHEMA_FILE="$APP_DIR/prisma/schema.prisma"
MIGRATION_NAME="20260427000000_add_production_calendar"

echo "=== Production Calendar - Server Deployment ==="
echo ""

# Step 1: Check and update Prisma schema
echo "[1/5] Checking Prisma schema..."
if grep -q "ProductionCalendar" "$SCHEMA_FILE"; then
    echo "  ProductionCalendar model already exists in schema"
else
    echo "  Adding ProductionCalendar model to schema..."
    cat >> "$SCHEMA_FILE" << 'SCHEMA_EOF'

model ProductionCalendar {
  id          String   @id @default(cuid())
  date        DateTime @unique
  type        String   @default("HOLIDAY")
  title       String   @default("")
  isNonWorking Boolean  @default(true)
  year        Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("ProductionCalendar")
}
SCHEMA_EOF
    echo "  Model added successfully"
fi

# Step 2: Mark migration as applied
echo "[2/5] Marking migration as applied..."
cd "$APP_DIR"
npx prisma migrate resolve --applied "$MIGRATION_NAME" 2>&1 || echo "  (May already be marked)"

# Step 3: Generate Prisma client
echo "[3/5] Generating Prisma client..."
npx prisma generate 2>&1 | tail -3

# Step 4: Deploy
echo "[4/5] Deploying application..."
bash "$APP_DIR/deploy-ct.sh"

# Step 5: Verify
echo "[5/5] Verifying deployment..."
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080)
if [ "$HTTP_CODE" = "200" ]; then
    echo "  Application is running (HTTP $HTTP_CODE)"
else
    echo "  WARNING: Application returned HTTP $HTTP_CODE"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Log in to the app as admin"
echo "2. Go to Платежный календарь -> Производственный календарь"
echo "3. Review the calendar and click 'Пересчитать даты оплаты'"
echo ""

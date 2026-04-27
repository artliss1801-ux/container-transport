#!/bin/bash
# Deployment script for Production Calendar feature
# Run this on the VPS or use it as a guide for manual deployment
set -e

echo "=== Deploying Production Calendar Feature ==="
echo ""

APP_DIR="/home/ubuntuuser/ct-app"

# Step 1: Upload files (run from local machine)
echo "[1/6] Files should already be uploaded to $APP_DIR"
echo ""

# Step 2: Add ProductionCalendar model to Prisma schema
echo "[2/6] Adding ProductionCalendar model to Prisma schema..."
# This needs to be added to schema.prisma:
# model ProductionCalendar {
#   id          String   @id @default(cuid())
#   date        DateTime @unique
#   type        String   @default("HOLIDAY")
#   title       String   @default("")
#   isNonWorking Boolean @default(true)
#   year        Int
#   createdAt   DateTime @default(now())
#   updatedAt   DateTime @updatedAt
#
#   @@map("ProductionCalendar")
# }

echo "  Please add the ProductionCalendar model to prisma/schema.prisma"
echo ""

# Step 3: Generate Prisma client
echo "[3/6] Generating Prisma client..."
cd $APP_DIR
npx prisma generate 2>&1 | tail -3
echo ""

# Step 4: Mark migration as applied (table already created via SQL)
echo "[4/6] Marking migration as applied..."
npx prisma migrate resolve --applied 20260427000000_add_production_calendar 2>&1 || echo "  (Migration may already be marked)"
echo ""

# Step 5: Build and deploy
echo "[5/6] Building and deploying..."
bash $APP_DIR/deploy-ct.sh
echo ""

# Step 6: Recalculate all payment dates
echo "[6/6] Recalculating payment dates..."
echo "  Run this after deployment is complete:"
echo "  curl -X POST https://artliss.mooo.com/api/production-calendar/recalculate -H 'Content-Type: application/json' -b 'your-auth-cookie'"
echo ""

echo "=== Done! ==="

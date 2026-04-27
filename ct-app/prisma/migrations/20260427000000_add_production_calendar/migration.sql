-- Migration: Add ProductionCalendar model
-- This migration adds a production calendar table for tracking Russian holidays and working days

-- Create ProductionCalendar table
CREATE TABLE IF NOT EXISTS "ProductionCalendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'HOLIDAY',
    "title" TEXT NOT NULL DEFAULT '',
    "isNonWorking" BOOLEAN NOT NULL DEFAULT TRUE,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create unique index on date
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionCalendar_date_key" ON "ProductionCalendar"("date");

-- Create index on year for fast queries
CREATE INDEX IF NOT EXISTS "ProductionCalendar_year_idx" ON "ProductionCalendar"("year");

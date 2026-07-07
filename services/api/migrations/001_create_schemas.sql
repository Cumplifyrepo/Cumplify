-- Migration 001: Create per-module schemas (design §5.3)
-- Module-spec entity names govern; per-module schemas m1..m5 (corpus deviation from C.1 documented)

CREATE SCHEMA IF NOT EXISTS m1;
CREATE SCHEMA IF NOT EXISTS m2;
CREATE SCHEMA IF NOT EXISTS m3;
CREATE SCHEMA IF NOT EXISTS m4;
CREATE SCHEMA IF NOT EXISTS m5;
CREATE SCHEMA IF NOT EXISTS m5_views;

-- Migrations tracking table (in public schema)
CREATE TABLE IF NOT EXISTS public._migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT NOT NULL
);

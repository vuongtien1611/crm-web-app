#!/bin/bash
set -e

echo "=================================================="
echo "CRM PostgreSQL Database Initialization & Verification"
echo "=================================================="

echo "1. Applying DDL Schema V4.2 (crm_order_schema.sql)..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /database/crm_order_schema.sql

echo "1.5. Applying Additive Migrations..."
for f in /database/migrations/*.sql; do
    [ -f "$f" ] && psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
done

echo "2. Applying Master Data Seed V4.5 (crm_seed.sql) Run #1..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /database/crm_seed.sql

echo "3. Applying Master Data Seed V4.5 (crm_seed.sql) Run #2 (Idempotency Audit)..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /database/crm_seed.sql

echo "=== Database Initialization Complete ==="

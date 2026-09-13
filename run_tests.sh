#!/bin/bash
pnpm --filter api test:commission > test_commission.log 2>&1
echo "COMMISSION_DONE"
pnpm --filter api test:kpi > test_kpi.log 2>&1
echo "KPI_DONE"

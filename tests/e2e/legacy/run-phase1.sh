#!/usr/bin/env bash
# Rebuilds the throwaway test game on the dev deployment, then runs the Phase 1 browser test.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
SLUG=test-e2e
npx convex run admin:deleteTestGame "{\"slug\":\"$SLUG\"}" >/dev/null
CLOSES=$(( ($(date +%s) + 86400*7) * 1000 ))
KEY=$(npx convex run admin:createGame "{\"slug\":\"$SLUG\",\"title\":\"The Velvet Room (test)\",\"isTest\":true,\"makeActive\":false,\"registrationClosesAt\":$CLOSES,\"deadlineLabel\":\"Sat, Oct 24\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hostKey"])')
SLUG=$SLUG HOST_KEY=$KEY python3 tests/e2e/phase1.py

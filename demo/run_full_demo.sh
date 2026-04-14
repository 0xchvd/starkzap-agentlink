#!/usr/bin/env bash
# AgentLink — end-to-end demo runner.
#
# Prereqs:
#   - contracts/ compiled and AgentLinkEscrow deployed to Sepolia
#   - demo/.env filled in (see demo/env.example)
#   - bun installed, dependencies resolved in sdk/
#
# This script runs the three user journeys back to back:
#   1. Sender creates a 20 STRK AgentLink targeted at the agent.
#   2. Agent signs and spends 1 STRK via the escrow.
#   3. Verifier queries remaining budget + recipient balance delta.
#
# Total tx count: 2 (create_link batches approve + create, spend is a single
# tx). Both are sent sponsored via Starkzap's AVNU paymaster so neither the
# sender nor the agent pays gas out of pocket for this demo.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

if [ ! -f demo/.env ]; then
  echo "error: demo/.env not found. Copy demo/env.example and fill it in." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. demo/.env
set +a

echo "=========================================="
echo "AgentLink end-to-end demo"
echo "=========================================="
echo ""

echo "--- Step 1: sender creates AgentLink ---"
bun run demo/create_link.ts
echo ""

echo "--- Step 2: agent spends via session key ---"
bun run demo/agent_spend.ts
echo ""

echo "--- Step 3: verify on-chain state ---"
bun run demo/verify_receipt.ts
echo ""

echo "=========================================="
echo "Demo complete. Transcript in demo/link.json"
echo "=========================================="

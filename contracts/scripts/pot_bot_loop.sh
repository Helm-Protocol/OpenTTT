#!/bin/bash
# pot_bot_loop.sh — Continuous PoT data accumulation via TTTHookSimple.verifySwap()
# Runs in tmux session, calls verifySwap every 5 seconds
# Usage: tmux new-session -d -s pot_bot "bash ~/.tikitaka/sdk/contracts/scripts/pot_bot_loop.sh"

set -e

DIR="$HOME/.tikitaka/sdk/contracts"
cd "$DIR"
source .env

LOG_FILE="$DIR/pot_bot.log"
COUNTER_FILE="$DIR/pot_bot_counter.txt"

# Initialize counter
if [ ! -f "$COUNTER_FILE" ]; then
  echo "0" > "$COUNTER_FILE"
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — PoT Bot started" | tee -a "$LOG_FILE"
echo "  TTTHookSimple: 0x8C633b05b833a476925F7d9818da6E215760F2c7" | tee -a "$LOG_FILE"
echo "  Interval: 5 seconds" | tee -a "$LOG_FILE"
echo "  Subgraph: https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0" | tee -a "$LOG_FILE"

while true; do
  COUNT=$(cat "$COUNTER_FILE")
  COUNT=$((COUNT + 1))
  echo "$COUNT" > "$COUNTER_FILE"

  echo "" | tee -a "$LOG_FILE"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Call #$COUNT" | tee -a "$LOG_FILE"

  # Run a single verifySwap call via hardhat
  npx hardhat run scripts/single_verify.ts --network baseSepolia 2>&1 | tee -a "$LOG_FILE"

  # Check remaining ETH balance
  BAL=$(curl -s -X POST https://sepolia.base.org -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"0x98603D935b6Ba2472a7cb48308e801F7ab6287f7\",\"latest\"],\"id\":1}" \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(f'{int(r[\"result\"],16)/1e18:.6f}')" 2>/dev/null)
  echo "  ETH remaining: $BAL" | tee -a "$LOG_FILE"

  # Stop if balance too low (< 0.005 ETH)
  LOW=$(python3 -c "print('yes' if float('${BAL:-0}') < 0.005 else 'no')" 2>/dev/null)
  if [ "$LOW" = "yes" ]; then
    echo "  LOW BALANCE — stopping bot" | tee -a "$LOG_FILE"
    break
  fi

  echo "  Sleeping 5 seconds..." | tee -a "$LOG_FILE"
  sleep 1
done

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — PoT Bot stopped after $COUNT calls" | tee -a "$LOG_FILE"

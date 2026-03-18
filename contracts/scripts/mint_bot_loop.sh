#!/bin/bash
# mint_bot_loop.sh — Direct TTT mint for PoT anchor accumulation (Channel 2)
DIR="$HOME/.tikitaka/sdk/contracts"
cd "$DIR"
source .env
LOG="$DIR/mint_bot.log"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Mint Bot started (90s interval)" | tee -a "$LOG"
COUNT=0
while true; do
  COUNT=$((COUNT + 1))
  RESULT=$(npx hardhat run scripts/single_mint.ts --network baseSepolia 2>&1)
  if echo "$RESULT" | grep -q "Minted"; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Mint #$COUNT OK" | tee -a "$LOG"
  else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Mint #$COUNT FAIL: $(echo $RESULT | tail -1)" | tee -a "$LOG"
  fi
  # Check balance
  BAL=$(curl -s -X POST https://sepolia.base.org -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"0x98603D935b6Ba2472a7cb48308e801F7ab6287f7\",\"latest\"],\"id\":1}" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16)/1e18)")
  if python3 -c "exit(0 if $BAL < 0.005 else 1)"; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Low ETH ($BAL). Stopping." | tee -a "$LOG"
    break
  fi
  sleep 1
done

#!/bin/bash
# mcp_bot_loop.sh — Channel 3: MCP pot_generate calls for data diversity
# Runs pot_generate via the MCP tools directly (no MCP server needed)
DIR="$HOME/.tikitaka/sdk/mcp"
cd "$DIR"
LOG="$DIR/mcp_bot.log"
COUNT=0
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — MCP Bot started (10s interval)" | tee -a "$LOG"

while true; do
  COUNT=$((COUNT + 1))
  # Generate a random tx hash to simulate MCP pot_generate calls
  TX_HASH="0x$(openssl rand -hex 32)"
  RESULT=$(node -e "
    const { potGenerate } = require('./dist/tools');
    potGenerate({ txHash: '$TX_HASH', chainId: 84532, poolAddress: '0x8C633b05b833a476925F7d9818da6E215760F2c7' })
      .then(r => console.log('OK: ' + JSON.stringify(r).substring(0, 80)))
      .catch(e => console.log('FAIL: ' + e.message.substring(0, 80)));
  " 2>&1)
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — MCP #$COUNT $RESULT" | tee -a "$LOG"
  sleep 1
done

#!/usr/bin/env bash
# migrate_crypto.sh — Migrate OpenTTT SDK from local crypto files to @helm-protocol/helm-crypto
# Created: 2026-03-15
#
# This script:
#   1. Ensures helm-crypto has all 5 files (copies missing ones)
#   2. Updates src/index.ts to re-export from @helm-protocol/helm-crypto
#   3. Updates src/ files that import directly from crypto modules
#   4. Updates test files that import directly from crypto modules
#   5. Deletes the 5 local crypto source files
#   6. Adds @helm-protocol/helm-crypto dependency to package.json
#   7. Runs npm install, tsc --noEmit, and npx jest to verify

set -euo pipefail

SDK_DIR="$HOME/.tikitaka/sdk"
CRYPTO_DIR="$HOME/helm/packages/crypto"
CRYPTO_SRC="$CRYPTO_DIR/src"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

CRYPTO_FILES=(golay.ts grg_forward.ts grg_inverse.ts reed_solomon.ts grg_pipeline.ts)

DRY_RUN=true
if [[ "${1:-}" == "--execute" ]]; then
  DRY_RUN=false
fi

log()  { echo -e "${GREEN}[migrate]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

# ─────────────────────────────────────────────
# STEP 0: Pre-flight checks
# ─────────────────────────────────────────────
log "=== OpenTTT Crypto Migration ==="
if $DRY_RUN; then
  warn "DRY RUN MODE — no changes will be made. Use --execute to apply."
else
  warn "EXECUTE MODE — changes will be applied!"
fi
echo ""

# Verify directories exist
if [[ ! -d "$SDK_DIR/src" ]]; then
  err "SDK src directory not found: $SDK_DIR/src"
  exit 1
fi
if [[ ! -d "$CRYPTO_DIR" ]]; then
  err "helm-crypto package not found: $CRYPTO_DIR"
  exit 1
fi

# ─────────────────────────────────────────────
# STEP 1: Check helm-crypto has all 5 files
# ─────────────────────────────────────────────
log "Step 1: Checking helm-crypto has all 5 crypto files..."
MISSING_IN_CRYPTO=()
for f in "${CRYPTO_FILES[@]}"; do
  if [[ -f "$CRYPTO_SRC/$f" ]]; then
    info "  [OK] $f exists in helm-crypto"
  else
    warn "  [MISSING] $f — will copy from SDK"
    MISSING_IN_CRYPTO+=("$f")
  fi
done
echo ""

if [[ ${#MISSING_IN_CRYPTO[@]} -gt 0 ]]; then
  log "Copying ${#MISSING_IN_CRYPTO[@]} missing file(s) to helm-crypto..."
  for f in "${MISSING_IN_CRYPTO[@]}"; do
    if $DRY_RUN; then
      info "  Would copy: $SDK_DIR/src/$f -> $CRYPTO_SRC/$f"
    else
      cp "$SDK_DIR/src/$f" "$CRYPTO_SRC/$f"
      log "  Copied: $f"
    fi
  done
  echo ""

  # Update helm-crypto index.ts to export the new files
  log "Updating helm-crypto src/index.ts to export all 5 modules..."
  CRYPTO_INDEX="$CRYPTO_SRC/index.ts"
  if $DRY_RUN; then
    info "  Would create/update: $CRYPTO_INDEX"
    info '  Content: export * from each of the 5 modules'
  else
    cat > "$CRYPTO_INDEX" << 'INDEXEOF'
// @helm-protocol/helm-crypto — GRG cryptographic pipeline
export * from "./golay";
export * from "./grg_forward";
export * from "./grg_inverse";
export * from "./reed_solomon";
export * from "./grg_pipeline";
INDEXEOF
    log "  Updated $CRYPTO_INDEX"
  fi

  # Build helm-crypto
  log "Building helm-crypto..."
  if $DRY_RUN; then
    info "  Would run: cd $CRYPTO_DIR && npm run build"
  else
    (cd "$CRYPTO_DIR" && npm run build)
    log "  helm-crypto built successfully"
  fi
  echo ""
fi

# ─────────────────────────────────────────────
# STEP 2: Update src/index.ts
# ─────────────────────────────────────────────
log "Step 2: Updating src/index.ts..."
info "  Replacing 5 individual crypto exports with single @helm-protocol/helm-crypto re-export"

EXPORT_LINES_TO_REMOVE=(
  'export * from "./golay";'
  'export * from "./grg_forward";'
  'export * from "./grg_inverse";'
  'export * from "./reed_solomon";'
  'export * from "./grg_pipeline";'
)

if $DRY_RUN; then
  info "  Would remove these lines from src/index.ts:"
  for line in "${EXPORT_LINES_TO_REMOVE[@]}"; do
    info "    - $line"
  done
  info '  Would add: export * from "@helm-protocol/helm-crypto";'
else
  INDEX_FILE="$SDK_DIR/src/index.ts"
  # Remove the 5 crypto export lines
  for line in "${EXPORT_LINES_TO_REMOVE[@]}"; do
    sed -i "\|^${line}$|d" "$INDEX_FILE"
  done
  # Add the single re-export after the first line (comment)
  sed -i '1 a export * from "@helm-protocol/helm-crypto";' "$INDEX_FILE"
  log "  Updated src/index.ts"
fi
echo ""

# ─────────────────────────────────────────────
# STEP 3: Update src/ files with direct crypto imports
# ─────────────────────────────────────────────
log "Step 3: Updating src/ files with direct crypto imports..."

# auto_mint.ts: import { GrgForward } from "./grg_forward" -> from "@helm-protocol/helm-crypto"
# adaptive_switch.ts: import { GrgInverse } from "./grg_inverse" -> from "@helm-protocol/helm-crypto"
#
# NOTE: grg_inverse.ts, grg_forward.ts, grg_pipeline.ts also have cross-imports
# but those files are being DELETED, so no need to update them.

declare -A SRC_UPDATES
SRC_UPDATES["$SDK_DIR/src/auto_mint.ts"]='s|from "./grg_forward"|from "@helm-protocol/helm-crypto"|g'
SRC_UPDATES["$SDK_DIR/src/adaptive_switch.ts"]='s|from "./grg_inverse"|from "@helm-protocol/helm-crypto"|g'

for file in "${!SRC_UPDATES[@]}"; do
  pattern="${SRC_UPDATES[$file]}"
  basename_f=$(basename "$file")
  if $DRY_RUN; then
    info "  Would update: $basename_f"
    info "    sed: $pattern"
  else
    sed -i "$pattern" "$file"
    log "  Updated: $basename_f"
  fi
done
echo ""

# ─────────────────────────────────────────────
# STEP 4: Update test files
# ─────────────────────────────────────────────
log "Step 4: Updating test files with direct crypto imports..."

# Map of test files and their sed replacements
# All "../src/<crypto_module>" -> "@helm-protocol/helm-crypto"
declare -A TEST_UPDATES
TEST_UPDATES["$SDK_DIR/tests/turbo_full.test.ts"]='s|from "../src/grg_forward"|from "@helm-protocol/helm-crypto"|g'
TEST_UPDATES["$SDK_DIR/tests/ttt_builder.test.ts"]='s|from "../src/grg_forward"|from "@helm-protocol/helm-crypto"|g'
TEST_UPDATES["$SDK_DIR/tests/golay.test.ts"]='s|from "../src/golay"|from "@helm-protocol/helm-crypto"|g'
TEST_UPDATES["$SDK_DIR/tests/reed_solomon.test.ts"]='s|from "../src/reed_solomon"|from "@helm-protocol/helm-crypto"|g'
TEST_UPDATES["$SDK_DIR/tests/grg_pipeline.test.ts"]='s|from "../src/grg_pipeline"|from "@helm-protocol/helm-crypto"|g'
TEST_UPDATES["$SDK_DIR/tests/grg_forward_branch.test.ts"]='s|from "../src/grg_forward"|from "@helm-protocol/helm-crypto"|g'
TEST_UPDATES["$SDK_DIR/tests/adaptive_switch_branch.test.ts"]='s|from "../src/grg_forward"|from "@helm-protocol/helm-crypto"|g'

# These files have multiple crypto imports — need multiple sed passes
E2E_FILE="$SDK_DIR/tests/e2e.test.ts"
GRG_INV_FILE="$SDK_DIR/tests/grg_inverse_branch.test.ts"

if $DRY_RUN; then
  for file in "${!TEST_UPDATES[@]}"; do
    info "  Would update: $(basename "$file")"
  done
  info "  Would update: e2e.test.ts (2 crypto imports -> 1 combined)"
  info "  Would update: grg_inverse_branch.test.ts (2 crypto imports -> 1 combined)"
else
  for file in "${!TEST_UPDATES[@]}"; do
    pattern="${TEST_UPDATES[$file]}"
    sed -i "$pattern" "$file"
    log "  Updated: $(basename "$file")"
  done

  # e2e.test.ts: has GrgForward from ../src/grg_forward AND GrgInverse from ../src/grg_inverse
  # Merge into single import
  sed -i 's|import { GrgForward } from "../src/grg_forward";|import { GrgForward, GrgInverse } from "@helm-protocol/helm-crypto";|' "$E2E_FILE"
  sed -i '/import { GrgInverse } from "..\/src\/grg_inverse";/d' "$E2E_FILE"
  log "  Updated: e2e.test.ts (merged 2 imports)"

  # grg_inverse_branch.test.ts: has GrgInverse from ../src/grg_inverse AND GrgForward from ../src/grg_forward
  sed -i 's|import { GrgInverse } from "../src/grg_inverse";|import { GrgInverse, GrgForward } from "@helm-protocol/helm-crypto";|' "$GRG_INV_FILE"
  sed -i '/import { GrgForward } from "..\/src\/grg_forward";/d' "$GRG_INV_FILE"
  log "  Updated: grg_inverse_branch.test.ts (merged 2 imports)"
fi
echo ""

# ─────────────────────────────────────────────
# STEP 5: Delete local crypto source files
# ─────────────────────────────────────────────
log "Step 5: Deleting local crypto source files..."
for f in "${CRYPTO_FILES[@]}"; do
  filepath="$SDK_DIR/src/$f"
  if $DRY_RUN; then
    info "  Would delete: src/$f"
  else
    rm -f "$filepath"
    log "  Deleted: src/$f"
  fi
done
echo ""

# ─────────────────────────────────────────────
# STEP 6: Add dependency to package.json
# ─────────────────────────────────────────────
log "Step 6: Adding @helm-protocol/helm-crypto to package.json..."
if $DRY_RUN; then
  info '  Would add: "@helm-protocol/helm-crypto": "file:../../helm/packages/crypto"'
else
  cd "$SDK_DIR"
  # Use node to safely modify package.json
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies['@helm-protocol/helm-crypto'] = 'file:../../helm/packages/crypto';
    // Sort dependencies for cleanliness
    const sorted = {};
    Object.keys(pkg.dependencies).sort().forEach(k => sorted[k] = pkg.dependencies[k]);
    pkg.dependencies = sorted;
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  log "  Added dependency to package.json"
fi
echo ""

# ─────────────────────────────────────────────
# STEP 7: npm install
# ─────────────────────────────────────────────
log "Step 7: Running npm install..."
if $DRY_RUN; then
  info "  Would run: cd $SDK_DIR && npm install"
else
  cd "$SDK_DIR"
  npm install
  log "  npm install completed"
fi
echo ""

# ─────────────────────────────────────────────
# STEP 8: TypeScript check
# ─────────────────────────────────────────────
log "Step 8: Running tsc --noEmit..."
if $DRY_RUN; then
  info "  Would run: cd $SDK_DIR && npx tsc --noEmit"
else
  cd "$SDK_DIR"
  if npx tsc --noEmit; then
    log "  tsc --noEmit PASSED"
  else
    err "  tsc --noEmit FAILED — check errors above"
    exit 1
  fi
fi
echo ""

# ─────────────────────────────────────────────
# STEP 9: Run tests
# ─────────────────────────────────────────────
log "Step 9: Running tests..."
if $DRY_RUN; then
  info "  Would run: cd $SDK_DIR && npx jest"
else
  cd "$SDK_DIR"
  if npx jest --forceExit; then
    log "  All tests PASSED"
  else
    err "  Tests FAILED — check errors above"
    exit 1
  fi
fi
echo ""

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
log "=== Migration Summary ==="
echo ""
info "Files deleted from SDK:"
for f in "${CRYPTO_FILES[@]}"; do
  info "  - src/$f"
done
echo ""
info "Files updated in SDK:"
info "  - src/index.ts (5 exports -> 1 re-export from @helm-protocol/helm-crypto)"
info "  - src/auto_mint.ts (import GrgForward from helm-crypto)"
info "  - src/adaptive_switch.ts (import GrgInverse from helm-crypto)"
info "  - tests/turbo_full.test.ts"
info "  - tests/ttt_builder.test.ts"
info "  - tests/golay.test.ts"
info "  - tests/reed_solomon.test.ts"
info "  - tests/grg_pipeline.test.ts"
info "  - tests/grg_forward_branch.test.ts"
info "  - tests/adaptive_switch_branch.test.ts"
info "  - tests/e2e.test.ts (2 imports merged)"
info "  - tests/grg_inverse_branch.test.ts (2 imports merged)"
echo ""
if [[ ${#MISSING_IN_CRYPTO[@]} -gt 0 ]]; then
  info "Files copied TO helm-crypto:"
  for f in "${MISSING_IN_CRYPTO[@]}"; do
    info "  - $f"
  done
  echo ""
fi

if $DRY_RUN; then
  warn "DRY RUN complete. Run with --execute to apply changes."
else
  log "Migration complete!"
fi

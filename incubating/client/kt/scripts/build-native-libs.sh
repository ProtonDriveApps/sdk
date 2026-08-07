#!/usr/bin/env bash
#
# Build every native runtime library the Kotlin bindings need — libcrypto.so,
# libssl.so and libe_sqlite3.so, per Android ABI — into $OUTPUT_DIR/<abi>/.
# The recipes live one per library; this only sequences them.
#
# This is the single entry point. It is invoked by:
#   - internal/build/android/Dockerfile  (the CI android-builder image)
#   - scripts/local-jnilibs.sh           (local, non-CI builds)
#
# See native-libs-common.sh for the environment all three scripts share.
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/native-libs-common.sh"

log "NDK:        $ANDROID_NDK_ROOT ($NDK_HOST_TAG)"
log "Min API:    $ANDROID_API"
log "Output:     $OUTPUT_DIR"
log "ABIs:       ${ABIS[*]}"

# Pass the resolved set on so each recipe builds exactly what the caller asked
# for. A per-command assignment, so the array above stays an array here.
abis="${ABIS[*]}"
ABIS="$abis" bash "$SCRIPT_DIR/build-openssl.sh"
ABIS="$abis" bash "$SCRIPT_DIR/build-sqlite.sh"

log "Done. Native libs written to $OUTPUT_DIR"
for abi in "${ABIS[@]}"; do
  ls -l "$OUTPUT_DIR/$abi"/*.so
done

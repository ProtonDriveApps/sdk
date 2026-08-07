#!/usr/bin/env bash
#
# Build SQLite (libe_sqlite3.so) per Android ABI, 16 KB page aligned, into
# $OUTPUT_DIR/<abi>/. Run through build-native-libs.sh, or on its own to
# rebuild just this library. See native-libs-common.sh for the env it needs.
#
# Requirements on PATH: curl, unzip, sha256sum (or shasum).
#
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/native-libs-common.sh"

# Version and the digest of the exact archive it resolves to; bump together.
SQLITE_YEAR=2026
SQLITE_AMALGAMATION=sqlite-amalgamation-3530400
SQLITE_SHA256=1e71ddf93849c6a6ecf58b827c0692073d2dd7ee40196158068f7b29f422e87d

# SQLitePCLRaw "e_sqlite3" option set (the bundle the C# SDK links against).
SQLITE_FLAGS=(
  -DSQLITE_ENABLE_FTS3 -DSQLITE_ENABLE_FTS3_PARENTHESIS -DSQLITE_ENABLE_FTS4
  -DSQLITE_ENABLE_FTS5 -DSQLITE_ENABLE_JSON1 -DSQLITE_ENABLE_RTREE
  -DSQLITE_ENABLE_GEOPOLY -DSQLITE_ENABLE_COLUMN_METADATA
  -DSQLITE_ENABLE_DBSTAT_VTAB -DSQLITE_ENABLE_MATH_FUNCTIONS
  -DSQLITE_ENABLE_UNLOCK_NOTIFY -DSQLITE_ENABLE_FTS3_TOKENIZER
  -DSQLITE_THREADSAFE=1 -DSQLITE_DEFAULT_MEMSTATUS=0
)

require_tools curl unzip
work_init

log "Downloading SQLite amalgamation $SQLITE_AMALGAMATION"
curl -fsSL "https://www.sqlite.org/${SQLITE_YEAR}/${SQLITE_AMALGAMATION}.zip" -o "$WORK/sqlite.zip"
sha256_check "$WORK/sqlite.zip" "$SQLITE_SHA256"
unzip -q "$WORK/sqlite.zip" -d "$WORK"
AM="$WORK/$SQLITE_AMALGAMATION"

for abi in "${ABIS[@]}"; do
  IFS=: read -r _abi _target triple <<<"$(spec_for "$abi")"
  log "Building SQLite for $abi ($triple)"
  dest="$OUTPUT_DIR/$abi"
  mkdir -p "$dest"
  quiet "SQLite build ($abi)" \
    "$TOOLCHAIN/bin/${triple}${ANDROID_API}-clang" \
    -fPIC -shared -O2 \
    -Wl,-z,max-page-size=16384 -Wl,-soname,libe_sqlite3.so \
    "${SQLITE_FLAGS[@]}" \
    -I"$AM" "$AM/sqlite3.c" \
    -llog -o "$dest/libe_sqlite3.so"
  assert_16k "$dest/libe_sqlite3.so"
done

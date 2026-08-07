#!/usr/bin/env bash
#
# Shared preamble for the native-lib recipes (build-openssl.sh, build-sqlite.sh).
# Sourced, never executed: validates the environment, resolves the NDK toolchain
# and defines the helpers both recipes use.
#
# Required env:
#   ANDROID_NDK_ROOT   path to the Android NDK
#   NDK_HOST_TAG       prebuilt toolchain host tag (linux-x86_64, darwin-x86_64, …)
#   OUTPUT_DIR         destination directory (receives <abi>/lib*.so)
#
# Optional env:
#   ANDROID_API        min Android API level (default 21; matches the kt minSdk)
#   ABIS               space-separated subset to build (default: all)
#
# Sets: ABIS, ANDROID_API, TOOLCHAIN, READELF, and PATH (NDK toolchain first).

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

: "${ANDROID_NDK_ROOT:?ANDROID_NDK_ROOT must be set}"
: "${NDK_HOST_TAG:?NDK_HOST_TAG must be set}"
: "${OUTPUT_DIR:?OUTPUT_DIR must be set}"
ANDROID_API="${ANDROID_API:-21}"

# ABI:OpenSSL-Configure-target:NDK-clang-triple. A plain indexed array + string
# parsing (rather than an associative array) so this runs on the bash 3.2 that
# ships with macOS.
ABI_SPECS=(
  "arm64-v8a:android-arm64:aarch64-linux-android"
  "armeabi-v7a:android-arm:armv7a-linux-androideabi"
  "x86_64:android-x86_64:x86_64-linux-android"
)
ALL_ABIS=()
for spec in "${ABI_SPECS[@]}"; do ALL_ABIS+=("${spec%%:*}"); done

# spec_for <abi> -> prints "abi:target:triple", or returns 1 if the ABI is unknown.
spec_for() {
  local s
  for s in "${ABI_SPECS[@]}"; do
    [ "${s%%:*}" = "$1" ] && { printf '%s' "$s"; return 0; }
  done
  return 1
}

ncpu() { command -v nproc >/dev/null 2>&1 && nproc || sysctl -n hw.ncpu; }

require_tools() { # <tool…> — each recipe declares what it actually needs
  local t
  for t in "$@"; do
    command -v "$t" >/dev/null 2>&1 || die "'$t' is required but not on PATH"
  done
}

work_init() { # scratch dir + build log, removed on exit
  WORK="$(mktemp -d)"
  BUILD_LOG="$WORK/build.log"
  trap 'rm -rf "$WORK"' EXIT
}

quiet() { # <step> <cmd…> — run silently, dumping the log tail on failure
  "${@:2}" >>"$BUILD_LOG" 2>&1 && return 0
  echo "--- last 50 lines of the build log ---" >&2
  tail -50 "$BUILD_LOG" >&2
  die "$1 failed"
}

sha256_check() { # <file> <expected> — coreutils on Linux, shasum on macOS
  local actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$1")"
  else
    actual="$(shasum -a 256 "$1")"
  fi
  [ "${actual%% *}" = "$2" ] \
    || die "$(basename "$1"): sha256 mismatch (expected $2, got ${actual%% *})"
}

assert_16k() { # <lib> — fail unless every LOAD segment is 16 KB aligned
  # Align is the last column, so $NF holds it whether or not Flg is 'R E'.
  "$READELF" -l "$1" | awk '
      $1 == "LOAD" { seen = 1; if ($NF != "0x4000") bad = 1 }
      END { exit (seen && !bad) ? 0 : 1 }' \
    || die "$(basename "$1") is not 16 KB aligned (expected LOAD alignment 0x4000)"
}

command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 \
  || die "'sha256sum' or 'shasum' is required but not on PATH"

TOOLCHAIN="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/$NDK_HOST_TAG"
[ -d "$TOOLCHAIN" ] || die "NDK toolchain not found: $TOOLCHAIN"
READELF="$TOOLCHAIN/bin/llvm-readelf"

export ANDROID_NDK_ROOT ANDROID_API
export PATH="$TOOLCHAIN/bin:$PATH"

read -r -a ABIS <<<"${ABIS:-${ALL_ABIS[*]}}"
for abi in "${ABIS[@]}"; do
  spec_for "$abi" >/dev/null || die "unknown ABI '$abi' (valid: ${ALL_ABIS[*]})"
done

#!/usr/bin/env bash
#
# Local (non-CI) helper: build the Kotlin bindings' native libs (libcrypto,
# libssl, libe_sqlite3 per ABI) into <kt>/sdk/build/cs/jni-libs/<abi>/. It
# discovers an Android NDK + host toolchain, then delegates to the shared
# recipes via build-native-libs.sh. Gradle runs this automatically when the libs
# are missing (buildNativeRuntimeLibs); run it by hand otherwise.
#
# The NDK is taken from $ANDROID_NDK_ROOT / $ANDROID_NDK_HOME / $NDK_ROOT, else
# the newest ndk/<ver> under $ANDROID_HOME / $ANDROID_SDK_ROOT / the default SDK.
#
# Optional env: ABIS — space-separated subset to build (default: all).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The kt project root is the parent of this scripts/ directory; the libs go into
# the sdk module's gradle build dir. Resolving relative to the script keeps this
# working wherever the kt project is checked out.
KT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

find_ndk() {
  local c
  for c in "${ANDROID_NDK_ROOT:-}" "${ANDROID_NDK_HOME:-}" "${NDK_ROOT:-}"; do
    if [ -n "$c" ] && [ -d "$c" ]; then printf '%s' "$c"; return 0; fi
  done
  local sdk latest
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" \
             "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [ -n "$sdk" ] && [ -d "$sdk/ndk" ] || continue
    latest="$(ls -1 "$sdk/ndk" 2>/dev/null | sort -V | tail -1)"
    if [ -n "$latest" ]; then printf '%s' "$sdk/ndk/$latest"; return 0; fi
  done
  return 1
}

host_tag() { # <ndk> — prints the prebuilt toolchain host tag for this machine
  case "$(uname -s)" in
    Darwin)
      # The NDK historically ships only the x86_64 prebuilt (runs under Rosetta
      # on Apple silicon); prefer an arm64 prebuilt if a future NDK adds one.
      if [ -d "$1/toolchains/llvm/prebuilt/darwin-arm64" ]; then
        printf 'darwin-arm64'
      else
        printf 'darwin-x86_64'
      fi ;;
    Linux) printf 'linux-x86_64' ;;
    *) die "unsupported host OS: $(uname -s)" ;;
  esac
}

NDK="$(find_ndk)" || die "no Android NDK found; set ANDROID_NDK_ROOT"

export ANDROID_NDK_ROOT="$NDK"
# Assign then export: `export VAR="$(...)"` would swallow host_tag's exit status.
NDK_HOST_TAG="$(host_tag "$NDK")"
export NDK_HOST_TAG
export OUTPUT_DIR="${KT_ROOT}/sdk/build/cs/jni-libs"

# ABIS (if set) is inherited from the environment. Delegate to the shared recipe.
exec "${SCRIPT_DIR}/build-native-libs.sh"

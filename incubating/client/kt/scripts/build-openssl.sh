#!/usr/bin/env bash
#
# Build OpenSSL (libcrypto.so, libssl.so) per Android ABI, 16 KB page aligned,
# into $OUTPUT_DIR/<abi>/. Run through build-native-libs.sh, or on its own to
# rebuild just this library. See native-libs-common.sh for the env it needs.
#
# Requirements on PATH: curl, tar, make, perl, sha256sum (or shasum).
#
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/native-libs-common.sh"

# Version and the digest of the exact archive it resolves to; bump together.
OPENSSL_VERSION=3.0.21
OPENSSL_SHA256=617e29af8e421f46649484a4937e48c685e47f46488167c982f88bc4ec1d522f

require_tools curl tar make perl
work_init

log "Downloading OpenSSL $OPENSSL_VERSION"
curl -fsSL \
  "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" \
  -o "$WORK/openssl.tar.gz"
sha256_check "$WORK/openssl.tar.gz" "$OPENSSL_SHA256"

# max-page-size=16384: align LOAD segments for Android 15+ 16 KB pages (fine on
# 4 KB too). -Wno-macro-redefined: mute the harmless __ANDROID_API__ redefine
# from passing -D__ANDROID_API__ to Configure.
export CFLAGS="-Wno-macro-redefined -Wl,-z,max-page-size=16384"
export LDFLAGS="-Wl,-z,max-page-size=16384"

for abi in "${ABIS[@]}"; do
  IFS=: read -r _abi target _triple <<<"$(spec_for "$abi")"
  log "Building OpenSSL for $abi ($target)"
  rm -rf "$WORK/openssl-src"
  mkdir "$WORK/openssl-src"
  tar xzf "$WORK/openssl.tar.gz" -C "$WORK/openssl-src" --strip-components=1
  (
    cd "$WORK/openssl-src"
    # no-comp/no-engine match the jni-libs these replaced (~270 KB per ABI);
    # no-autoload-config drops the init-time openssl.cnf read Android never has.
    quiet "OpenSSL Configure ($abi)" ./Configure "$target" shared no-tests \
      no-comp no-engine no-autoload-config "-D__ANDROID_API__=${ANDROID_API}"
    quiet "OpenSSL build ($abi)" make -j"$(ncpu)" build_libs
  )
  dest="$OUTPUT_DIR/$abi"
  mkdir -p "$dest"
  cp "$WORK/openssl-src/libcrypto.so" "$dest/libcrypto.so"
  cp "$WORK/openssl-src/libssl.so" "$dest/libssl.so"
  assert_16k "$dest/libcrypto.so"
  assert_16k "$dest/libssl.so"
done

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
# 3.5 is the current LTS (to 2030-04-08); 3.0 went end-of-life on 2026-09-07.
OPENSSL_VERSION=3.5.7
OPENSSL_SHA256=a8c0d28a529ca480f9f36cf5792e2cd21984552a3c8e4aa11a24aa31aeac98e8

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
    # no-autoload-config drops the init-time openssl.cnf read Android never has;
    # no-quic and the PQC algorithms are 3.5 additions nothing here uses (~1.5 MB).
    quiet "OpenSSL Configure ($abi)" ./Configure "$target" shared no-tests \
      no-comp no-engine no-autoload-config \
      no-quic no-ml-dsa no-ml-kem no-slh-dsa no-sm2-precomp \
      "-D__ANDROID_API__=${ANDROID_API}"
    quiet "OpenSSL build ($abi)" make -j"$(ncpu)" build_libs
  )
  dest="$OUTPUT_DIR/$abi"
  mkdir -p "$dest"
  cp "$WORK/openssl-src/libcrypto.so" "$dest/libcrypto.so"
  cp "$WORK/openssl-src/libssl.so" "$dest/libssl.so"
  assert_16k "$dest/libcrypto.so"
  assert_16k "$dest/libssl.so"
done

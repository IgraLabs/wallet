#!/usr/bin/env bash
set -euo pipefail

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo is required to build the Igra Kaspa iOS backend" >&2
  exit 1
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "error: rustup is required to verify iOS Rust targets" >&2
  exit 1
fi

SRCROOT="${SRCROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLATFORM_NAME="${PLATFORM_NAME:-iphonesimulator}"
CRATE_DIR="${SRCROOT}/../native/igra-kaspa"
OUT_DIR="${CRATE_DIR}/target/ios-universal/${PLATFORM_NAME}"
OUT_LIB="${OUT_DIR}/libigra_kaspa.a"

rust_targets_for_platform() {
  case "${PLATFORM_NAME}" in
    iphoneos)
      echo "aarch64-apple-ios"
      ;;
    iphonesimulator)
      local archs="${ARCHS:-${CURRENT_ARCH:-arm64}}"
      local targets=""
      for arch in ${archs}; do
        case "${arch}" in
          arm64)
            targets="${targets} aarch64-apple-ios-sim"
            ;;
          x86_64)
            targets="${targets} x86_64-apple-ios"
            ;;
        esac
      done
      if [ -z "${targets}" ]; then
        targets=" aarch64-apple-ios-sim"
      fi
      echo "${targets}" | xargs -n1 | sort -u | xargs
      ;;
    *)
      echo "error: unsupported Xcode platform '${PLATFORM_NAME}' for Igra Kaspa Rust backend" >&2
      exit 1
      ;;
  esac
}

ensure_target_installed() {
  local target="$1"
  if ! rustup target list --installed | grep -q "^${target}$"; then
    echo "error: missing Rust target '${target}'. Run: rustup target add ${target}" >&2
    exit 1
  fi
}

mkdir -p "${OUT_DIR}"

built_libs=()
for target in $(rust_targets_for_platform); do
  ensure_target_installed "${target}"
  cargo build --manifest-path "${CRATE_DIR}/Cargo.toml" --release --target "${target}"
  built_libs+=("${CRATE_DIR}/target/${target}/release/libigra_kaspa.a")
done

if [ "${#built_libs[@]}" -eq 1 ]; then
  cp "${built_libs[0]}" "${OUT_LIB}"
else
  lipo -create "${built_libs[@]}" -output "${OUT_LIB}"
fi

echo "Igra Kaspa Rust backend: ${OUT_LIB}"

#!/usr/bin/env bash
# Builds both contracts to wasm with cargo-near (macOS/Linux/WSL).
# One-time: rustup target add wasm32-unknown-unknown && cargo install --locked cargo-near
set -euo pipefail
cd "$(dirname "$0")/.."
for crate in contract token; do
  echo "Building $crate ..."
  (cd "$crate" && cargo near build non-reproducible-wasm --no-abi)
done
ls -la contract/target/near/*.wasm token/target/near/*.wasm 2>/dev/null || find contract/target/near token/target/near -name '*.wasm'

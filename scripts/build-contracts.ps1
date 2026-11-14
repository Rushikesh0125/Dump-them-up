# Builds both contracts to wasm with cargo-near. Run from the repo root in PowerShell:
#   .\scripts\build-contracts.ps1
# One-time prerequisites:
#   rustup target add wasm32-unknown-unknown
#   cargo install --locked cargo-near
$ErrorActionPreference = "Stop"
foreach ($crate in @("contract", "token")) {
  Write-Host "Building $crate ..."
  Push-Location $crate
  cargo near build non-reproducible-wasm --no-abi
  Pop-Location
}
Get-ChildItem -Recurse -Filter *.wasm contract\target\near, token\target\near | Select-Object FullName, Length

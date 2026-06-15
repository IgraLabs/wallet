# Igra Kaspa Native Bridge

This bridge is the M1 boundary for full Kaspa carrier ownership in Kraken Wallet.
It intentionally does not sign carrier transactions until a Rusty-Kaspa native
backend is linked on iOS and Android.

## Current State

- `NativeModules.IgraKaspa` is registered on Android and iOS.
- Android links a Rust JNI backend built from `native/igra-kaspa`.
- `getBridgeStatus()` reports whether the Rust backend is live.
- Android `deriveCarrierAddress()` can derive a Kaspa carrier address from an
  unlocked wallet seed buffer supplied as `seedHex`.
- `benchmarkNativeLoop()` measures native-side loop cost with one JS/native call.
- `benchmarkBridgeRoundTrips()` measures repeated Promise round trips across the
  RN bridge with a configurable payload size.
- Carrier signing/submission methods still fail closed with
  `E_IGRA_KASPA_RUST_BACKEND_MISSING`.

## API Target

```ts
deriveCarrierAddress({ seedHex, network, account, change, index })
getCarrierBalance({ address, network, rpcUrl })
buildAndSignCarrierTx({ keyRef, network, payloadHex, rpcUrl, feePolicy, selectedUtxos })
submitCarrierTx({ rawTxHex, network, rpcUrl })
```

Current Android derivation input:

```ts
deriveCarrierAddress({
  seedHex,
  network: 'testnet-10',
  account: 0,
  change: 0,
  index: 0,
})
```

The derivation path defaults to:

```text
m/44'/111111'/{account}'/{change}/{index}
```

Do not pass mnemonics through this bridge. The existing wallet unlock flow
returns a BIP39 seed buffer for signing; convert that transient buffer to hex
only for the native call.

## Android Build

The Android app builds the Rust JNI backend through `cargo-ndk`:

```sh
rustup target add aarch64-linux-android
cd android
./gradlew :app:assembleDebug
```

Default Rust ABI:

```text
arm64-v8a
```

Override if needed:

```sh
./gradlew :app:assembleDebug -PigraKaspaRustTargets=arm64-v8a
```

The pinned public Rusty-Kaspa revision currently fails for
`x86_64-linux-android` in `kaspa-hashes` with `Unsupported OS`, because its
assembly build script has no Android x86_64 case. Use an arm64 emulator/device
for this branch unless that upstream build script is patched.

## Performance Check

Run on a real device or emulator after installing a development build:

```ts
import IgraKaspa from './modules/igra-kaspa';

await IgraKaspa.getBridgeStatus();
await IgraKaspa.benchmarkNativeLoop(256, 10000);
await IgraKaspa.benchmarkBridgeRoundTrips(256, 250);
await IgraKaspa.benchmarkBridgeRoundTrips(4096, 100);
```

Interpretation:

- `benchmarkNativeLoop` should be very small; it is not the bridge cost.
- `benchmarkBridgeRoundTrips` is the RN bridge cost for sequential Promise calls.
- Carrier signing should avoid multiple bridge round trips per transaction. Use
  one native call for build/sign, and one native call for submit if submission is
  not bundled into the same backend flow.

## Next Backend Work

Link a small Rusty-Kaspa native library behind this module. Keep UTXO selection,
carrier tx construction, signing, serialization, and submission in native code.
Do not reimplement Kaspa signing or tx serialization in TypeScript.

# Igra Kaspa Native Bridge

This bridge is the M1 boundary for full Kaspa carrier ownership in Kraken Wallet.
It intentionally does not sign carrier transactions until a Rusty-Kaspa native
backend is linked on iOS and Android.

## Current State

- `NativeModules.IgraKaspa` is registered on Android and iOS.
- `getBridgeStatus()` reports whether the Rust backend is live.
- `benchmarkNativeLoop()` measures native-side loop cost with one JS/native call.
- `benchmarkBridgeRoundTrips()` measures repeated Promise round trips across the
  RN bridge with a configurable payload size.
- Carrier ownership methods fail closed with
  `E_IGRA_KASPA_RUST_BACKEND_MISSING`.

## API Target

```ts
deriveCarrierAddress({ keyRef, network, account, change, index })
getCarrierBalance({ address, network, rpcUrl })
buildAndSignCarrierTx({ keyRef, network, payloadHex, rpcUrl, feePolicy, selectedUtxos })
submitCarrierTx({ rawTxHex, network, rpcUrl })
```

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

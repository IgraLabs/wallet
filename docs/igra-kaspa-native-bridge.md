# Igra Kaspa Native Bridge

This bridge is the M1 boundary for full Kaspa carrier ownership in Kraken Wallet.
Android now links a Rusty-Kaspa native backend and can derive the carrier
address, build/sign a Kaspa carrier transaction, and submit it over Kaspa gRPC.
iOS still has the placeholder module and fails closed for carrier signing.

## Current State

- `NativeModules.IgraKaspa` is registered on Android and iOS.
- Android links a Rust JNI backend built from `native/igra-kaspa`.
- `getBridgeStatus()` reports whether the Rust backend is live.
- Android `deriveCarrierAddress()` can derive a Kaspa carrier address from an
  unlocked wallet seed buffer supplied as `seedHex`.
- Android `buildAndSignCarrierTx()` fetches UTXOs, wraps the signed canonical
  EVM transaction as Igra canonical raw L2Data, mines the Kaspa txid prefix,
  signs the Kaspa carrier tx, and returns serialized Kaspa RPC transaction JSON.
- Android `submitCarrierTx()` submits that serialized Kaspa transaction to the
  configured Kaspa gRPC endpoint.
- In-app Send and WalletConnect/browser `eth_sendTransaction` use the native
  carrier path for Igra canonical when the wallet seed is unlocked. The app
  returns the canonical EVM tx hash after successful Kaspa carrier submission.
- `benchmarkNativeLoop()` measures native-side loop cost with one JS/native call.
- `benchmarkBridgeRoundTrips()` measures repeated Promise round trips across the
  RN bridge with a configurable payload size.
- `getCarrierBalance()` is still not implemented in the wallet module.

## API Target

```ts
deriveCarrierAddress({ seedHex, network, account, change, index })
getCarrierBalance({ address, network, rpcUrl })
buildAndSignCarrierTx({ seedHex, network, payloadHex, rpcUrl, txIdPrefix, laneId, account })
submitCarrierTx({ rawTxJson, rpcUrl })
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

Default carrier config is in `config.ts`:

```text
IGRA_KASPA_RPC_URI=grpc://stage-roman.igralabs.com:16210
IGRA_KASPA_NETWORK=testnet-10
IGRA_KASPA_TX_ID_PREFIX=97b4
IGRA_KASPA_LANE_ID=97b10000
```

On Android emulator with an SSH tunnel to stage, override the gRPC URI to the
host loopback bridge, for example:

```text
IGRA_KASPA_RPC_URI=grpc://10.0.2.2:59210
```

The carrier address derivation uses the wallet account index as the Kaspa
account by default:

```text
m/44'/111111'/{wallet.accountIdx}'/0/0
```

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

Observed Android emulator bridge numbers from this branch:

```text
256-byte sequential RN bridge round trip: 0.37 ms
4096-byte sequential RN bridge round trip: 0.3 ms
```

## Remaining Work

- Add iOS Rust backend linkage.
- Implement `getCarrierBalance()`.
- Add a visible carrier-address/funding surface so the team can copy the Kaspa
  carrier address without using debug tooling.
- Add an in-app status view for the returned Kaspa carrier tx id. The normal app
  transaction id remains the canonical EVM tx hash.

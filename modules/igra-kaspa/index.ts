import { NativeModules, Platform } from 'react-native';

const NativeIgraKaspa = NativeModules.IgraKaspa as IgraKaspaNativeModule | undefined;

export type IgraKaspaBridgeStatus = {
  moduleName: string;
  bridgeVersion: string;
  backend: string;
  rustBackend: boolean;
  supportsCarrierSigning: boolean;
  supportsBridgeBenchmark: boolean;
};

export type IgraKaspaBenchmarkResult = {
  iterations: number;
  payloadBytes: number;
  elapsedMs: number;
  nsPerIteration: number;
  checksum: number;
  backend: string;
};

export type IgraKaspaEchoResult = {
  payloadBytes: number;
  checksum: number;
};

export type IgraKaspaRoundTripBenchmarkResult = {
  iterations: number;
  payloadBytes: number;
  elapsedMs: number;
  msPerRoundTrip: number;
  checksum: number;
  platform: typeof Platform.OS;
};

export type DeriveCarrierAddressParams = {
  keyRef: string;
  network: string;
  account?: number;
  change?: number;
  index?: number;
};

export type CarrierBalanceParams = {
  address: string;
  network: string;
  rpcUrl: string;
};

export type BuildAndSignCarrierTxParams = {
  keyRef: string;
  network: string;
  payloadHex: string;
  rpcUrl?: string;
  feePolicy?: Record<string, unknown>;
  selectedUtxos?: unknown[];
};

export type SubmitCarrierTxParams = {
  rawTxHex: string;
  network: string;
  rpcUrl: string;
};

type IgraKaspaNativeModule = {
  getBridgeStatus(): Promise<IgraKaspaBridgeStatus>;
  echoPayload(payload: string): Promise<IgraKaspaEchoResult>;
  benchmarkBridge(payloadBytes: number, iterations: number): Promise<IgraKaspaBenchmarkResult>;
  deriveCarrierAddress(params: DeriveCarrierAddressParams): Promise<{ address: string }>;
  getCarrierBalance(params: CarrierBalanceParams): Promise<unknown>;
  buildAndSignCarrierTx(params: BuildAndSignCarrierTxParams): Promise<unknown>;
  submitCarrierTx(params: SubmitCarrierTxParams): Promise<unknown>;
};

function requireNativeIgraKaspa(): IgraKaspaNativeModule {
  if (!NativeIgraKaspa) {
    throw new Error('IgraKaspa native module is not available');
  }
  return NativeIgraKaspa;
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function benchmarkPayload(payloadBytes: number): string {
  return 'a'.repeat(Math.max(0, Math.min(payloadBytes, 256 * 1024)));
}

export async function getBridgeStatus(): Promise<IgraKaspaBridgeStatus> {
  return requireNativeIgraKaspa().getBridgeStatus();
}

export async function benchmarkNativeLoop(payloadBytes = 256, iterations = 10_000): Promise<IgraKaspaBenchmarkResult> {
  return requireNativeIgraKaspa().benchmarkBridge(payloadBytes, iterations);
}

export async function benchmarkBridgeRoundTrips(payloadBytes = 256, iterations = 250): Promise<IgraKaspaRoundTripBenchmarkResult> {
  const bridge = requireNativeIgraKaspa();
  const payload = benchmarkPayload(payloadBytes);
  const startedAt = nowMs();
  let checksum = 0;

  for (let index = 0; index < iterations; index += 1) {
    const result = await bridge.echoPayload(payload);
    checksum = checksum ^ result.checksum;
  }

  const elapsedMs = nowMs() - startedAt;
  return {
    iterations,
    payloadBytes: payload.length,
    elapsedMs,
    msPerRoundTrip: elapsedMs / iterations,
    checksum,
    platform: Platform.OS,
  };
}

export async function deriveCarrierAddress(params: DeriveCarrierAddressParams): Promise<{ address: string }> {
  return requireNativeIgraKaspa().deriveCarrierAddress(params);
}

export async function getCarrierBalance(params: CarrierBalanceParams): Promise<unknown> {
  return requireNativeIgraKaspa().getCarrierBalance(params);
}

export async function buildAndSignCarrierTx(params: BuildAndSignCarrierTxParams): Promise<unknown> {
  return requireNativeIgraKaspa().buildAndSignCarrierTx(params);
}

export async function submitCarrierTx(params: SubmitCarrierTxParams): Promise<unknown> {
  return requireNativeIgraKaspa().submitCarrierTx(params);
}

export default {
  benchmarkBridgeRoundTrips,
  benchmarkNativeLoop,
  buildAndSignCarrierTx,
  deriveCarrierAddress,
  getBridgeStatus,
  getCarrierBalance,
  submitCarrierTx,
};

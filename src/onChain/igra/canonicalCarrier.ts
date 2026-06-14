import { IGRA_CANONICAL_CARRIER_RPC_URI } from '/config';

export const IGRA_VERSION = 0x9;
export const IGRA_CANONICAL_RAW_TX_TYPE = 0x04;
export const IGRA_CANONICAL_RAW_HEADER = (IGRA_VERSION << 4) | IGRA_CANONICAL_RAW_TX_TYPE;
export const IGRA_MAX_L2DATA_BYTES = 24800;

type JsonRpcResponse<T> = {
  id: number;
  jsonrpc: '2.0';
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export function buildIgraCanonicalCarrierPayload(rawTransaction: string, nonce: number = 0): string {
  const raw = hexToBytes(rawTransaction);
  validateCanonicalRawTransaction(raw);

  const payload = new Uint8Array(1 + raw.length + 4);
  payload[0] = IGRA_CANONICAL_RAW_HEADER;
  payload.set(raw, 1);
  writeU32Be(payload, payload.length - 4, nonce);

  return bytesToHex(payload);
}

export async function broadcastCanonicalRawTransactionViaGateway(
  rawTransaction: string,
  gatewayRpcUri: string = IGRA_CANONICAL_CARRIER_RPC_URI,
): Promise<string> {
  const response = await fetch(gatewayRpcUri, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction',
      params: [rawTransaction],
    }),
  });

  const body = (await response.json()) as JsonRpcResponse<string>;
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `Igra carrier gateway returned HTTP ${response.status}`);
  }
  if (!body.result) {
    throw new Error('Igra carrier gateway returned no transaction hash');
  }
  return body.result;
}

export function validateCanonicalRawTransaction(rawTransaction: Uint8Array): void {
  if (rawTransaction.length === 0) {
    throw new Error('empty canonical raw transaction bytes');
  }
  if (rawTransaction[0] === 0x03 || rawTransaction[0] === 0x04) {
    throw new Error('EIP-4844 and EIP-7702 canonical transactions are not supported by Igra carrier');
  }
  if (rawTransaction.length > IGRA_MAX_L2DATA_BYTES) {
    throw new Error(`canonical raw transaction size ${rawTransaction.length} bytes exceeds max ${IGRA_MAX_L2DATA_BYTES}`);
  }
}

function writeU32Be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function hexToBytes(value: string): Uint8Array {
  const hex = normalizeHex(value);
  if (hex.length % 2 !== 0) {
    throw new Error('hex string must contain an even number of digits');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeHex(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/u.test(hex)) {
    throw new Error('invalid hex string');
  }
  return hex.toLowerCase();
}

import { Connection } from '@solana/web3.js';

import { proxyRpcRequest } from '@/api/proxyRpcRequest';

import { ChainAgnostic } from './ChainAgnostic';

const PLACEHOLDER_ENDPOINT = 'https://solana-rpc.invalid/';

let nextNumericId = 1;

export function makeProxiedSolanaConnection(isTestnet: boolean): Connection {
  const networkCaipId = isTestnet ? ChainAgnostic.NETWORK_SOLANA_DEVNET : ChainAgnostic.NETWORK_SOLANA;

  return new Connection(PLACEHOLDER_ENDPOINT, {
    commitment: 'confirmed',
    fetch: async (_input, init) => {
      const rawBody = init?.body;
      const bodyStr = typeof rawBody === 'string' ? rawBody : '';
      let parsed: { jsonrpc?: string; id?: number | string; method?: string; params?: unknown };
      try {
        parsed = JSON.parse(bodyStr);
      } catch {
        throw new Error('Solana proxy: outgoing RPC body was not valid JSON');
      }

      if (Array.isArray(parsed)) {
        throw new Error('Solana proxy: batched JSON-RPC requests are not supported');
      }
      if (!parsed.method) {
        throw new Error('Solana proxy: outgoing RPC body had no method');
      }

      const originalId = parsed.id;
      const numericId = nextNumericId++;

      const result = await proxyRpcRequest(networkCaipId, parsed.method, parsed.params as unknown[] | object | undefined, numericId);

      const restored = { ...result, id: originalId };

      return new Response(JSON.stringify(restored), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

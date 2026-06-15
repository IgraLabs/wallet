import { keccak256 } from 'ethers';

import { EVMRPCTransport } from '@/onChain/wallets/evm';
import type { EVMNetwork } from '@/onChain/wallets/evm';

import { broadcastCanonicalRawTransactionViaGateway } from './canonicalCarrier';

import { IGRA_KASPA_LANE_ID, IGRA_KASPA_NETWORK, IGRA_KASPA_RPC_URI, IGRA_KASPA_TX_ID_PREFIX } from '/config';
import IgraKaspa from '/modules/igra-kaspa';
import type { BuildAndSignCarrierTxResult } from '/modules/igra-kaspa';

type IgraBuiltCarrierTransaction = BuildAndSignCarrierTxResult & {
  canonicalTxHash: string;
};

export class IgraCanonicalTransport extends EVMRPCTransport {
  async buildCarrierTransaction(signedTx: string, seed: ArrayBuffer, account?: number): Promise<IgraBuiltCarrierTransaction> {
    const carrierTx = await IgraKaspa.buildAndSignCarrierTx({
      account: account ?? 0,
      laneId: IGRA_KASPA_LANE_ID,
      network: IGRA_KASPA_NETWORK,
      payloadHex: signedTx,
      rpcUrl: IGRA_KASPA_RPC_URI,
      seedHex: arrayBufferToHex(seed),
      txIdPrefix: IGRA_KASPA_TX_ID_PREFIX,
    });

    return {
      ...carrierTx,
      canonicalTxHash: keccak256(signedTx),
    };
  }

  async submitCarrierTransaction(carrierTx: IgraBuiltCarrierTransaction): Promise<string> {
    const result = await IgraKaspa.submitCarrierTx({
      rawTxJson: carrierTx.rawTxJson,
      rpcUrl: IGRA_KASPA_RPC_URI,
    });

    console.log('Igra carrier submitted', {
      canonicalTxHash: carrierTx.canonicalTxHash,
      kaspaTxId: result.kaspaTxId,
    });

    return carrierTx.canonicalTxHash;
  }

  async broadcastCarrierTransaction(_network: EVMNetwork, signedTx: string, seed: ArrayBuffer, account?: number): Promise<string> {
    const carrierTx = await this.buildCarrierTransaction(signedTx, seed, account);
    return this.submitCarrierTransaction(carrierTx);
  }

  async broadcastTransaction(_network: EVMNetwork, signedTx: string): Promise<string> {
    return broadcastCanonicalRawTransactionViaGateway(signedTx);
  }
}

export function isIgraCanonicalTransport(transport: unknown): transport is IgraCanonicalTransport {
  return transport instanceof IgraCanonicalTransport;
}

function arrayBufferToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

import { EVMRPCTransport } from '@/onChain/wallets/evm';
import type { EVMNetwork } from '@/onChain/wallets/evm';

import { broadcastCanonicalRawTransactionViaGateway } from './canonicalCarrier';

export class IgraCanonicalTransport extends EVMRPCTransport {
  async broadcastTransaction(_network: EVMNetwork, signedTx: string): Promise<string> {
    return broadcastCanonicalRawTransactionViaGateway(signedTx);
  }
}

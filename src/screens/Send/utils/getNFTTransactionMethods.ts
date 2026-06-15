import type { FeeOption } from '@/api/types';
import { isIgraCanonicalTransport } from '@/onChain/igra/IgraCanonicalTransport';
import type { PreparedTransaction } from '@/onChain/wallets/base';
import { getImplForWallet } from '@/onChain/wallets/registry';
import type { IWalletStorage } from '@/onChain/wallets/walletState';
import type { RealmWallet } from '@/realm/wallets';

import type { NftTransactionParams } from '../types';

export function getNFTTransactionMethods<TType, TRequest, TFeeOption extends FeeOption>(
  wallet: RealmWallet,
  getWalletStorage: (wallet: RealmWallet) => Promise<IWalletStorage<unknown>>,
  { address, nft }: NftTransactionParams,
) {
  const { network, transport } = getImplForWallet<TType, TRequest, TFeeOption>(wallet);

  const create = async (): Promise<TRequest> => {
    if (!network.createNFTTransferTransaction) {
      throw Error('NFT not supported');
    }
    return network.createNFTTransferTransaction(wallet, address, nft);
  };

  const prepare = async (tRequest: TRequest, feeOption: TFeeOption, final?: boolean): Promise<PreparedTransaction<TType>> => {
    const walletStorage = await getWalletStorage(wallet);
    return transport.prepareTransaction(network, wallet, walletStorage, tRequest, feeOption, final);
  };

  const sign = async (preparedTx: PreparedTransaction<TType>, seed: ArrayBuffer) => {
    const txhex = await network.signTransaction({ ...wallet, seed: { data: seed } }, preparedTx.data);

    return {
      ...preparedTx,
      igraCarrierTx: isIgraCanonicalTransport(transport) ? await transport.buildCarrierTransaction(txhex, seed, wallet.accountIdx) : undefined,
      txhex,
    };
  };

  const broadcast = (signed: Awaited<ReturnType<typeof sign>>) => {
    if (isIgraCanonicalTransport(transport) && signed.igraCarrierTx) {
      return transport.submitCarrierTransaction(signed.igraCarrierTx);
    }

    return transport.broadcastTransaction(network, signed.txhex);
  };

  return {
    create,
    prepare,
    sign,
    broadcast,
  };
}

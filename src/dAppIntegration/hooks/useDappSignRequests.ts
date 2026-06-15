import { useNavigation } from '@react-navigation/native';

import { useCallback, useMemo } from 'react';

import type { EVMFeeOption } from '@/api/types';
import { isIgraCanonicalTransport } from '@/onChain/igra/IgraCanonicalTransport';
import { getImplForWallet } from '@/onChain/wallets/registry';
import type { WalletStorage } from '@/onChain/wallets/walletState';
import { getWalletStorage } from '@/onChain/wallets/walletState';
import { useRealm } from '@/realm/RealmContext';
import { useAppCurrency } from '@/realm/settings';
import type { RealmWallet } from '@/realm/wallets';
import { useSecuredKeychain } from '@/secureStore/SecuredKeychainProvider';

import { EvmRpcMethod } from '../constants';
import { openSignMessageApproveModal } from '../openSignMessageApproveModal';
import { openSignTransactionModal } from '../openSignTransactionApprovalModal';
import { type PageInfo } from '../types';

import { isEVMHarmonyTransport, isEVMNetwork, isEVMTransactionTransport } from '/modules/wallet-connect/utils';
import { type TransactionObject, ethSignFnMap } from '/modules/wallet-connect/web3Wallet/ethereum';

export const useDappSignRequests = (wallet: RealmWallet, pageInfo: PageInfo | null) => {
  const { getSeed } = useSecuredKeychain();
  const realm = useRealm();
  const { dispatch } = useNavigation();
  const { currency } = useAppCurrency();
  const { network, transport } = useMemo(() => getImplForWallet(wallet), [wallet]);

  const signEvmMessage = useCallback(
    async (method: EvmRpcMethod, params: unknown[], domain: string, baseUrl: string) => {
      if (!isEVMNetwork(network) || !isEVMHarmonyTransport(transport)) {
        throw new Error(`Can't sign an EVM message with a non-EVM wallet`);
      }

      const approved = await openSignMessageApproveModal({ method, params, wallet, dispatch, pageInfo, transport, network, domain, baseUrl });

      if (approved) {
        const seed = await getSeed('sign');

        if (seed === false) {
          return;
        }

        return network[ethSignFnMap[method]](
          {
            ...wallet,
            seed: {
              data: seed,
            },
          },
          (method === EvmRpcMethod.personal_sign ? params[0] : params[1]) as string,
        );
      }
    },
    [transport, network, wallet, dispatch, pageInfo, getSeed],
  );

  const signEvmTransactionWithSeed = useCallback(
    async (method: EvmRpcMethod, params: unknown[], domain: string, baseUrl: string) => {
      if (!isEVMTransactionTransport(transport) || !isEVMNetwork(network)) {
        throw new Error(`Can't sign an EVM transaction with a non-EVM wallet`);
      }

      const transaction = params[0] as TransactionObject;

      const approveObject = await openSignTransactionModal({
        method,
        network,
        transaction,
        wallet,
        dispatch,
        transport,
        pageInfo,
        realm,
        currency,
        domain,
        baseUrl,
      });

      if (!approveObject.approveSignRequest) {
        return;
      }

      const seed = await getSeed('sign');

      if (seed === false) {
        return;
      }

      const fee = approveObject.fee as EVMFeeOption;

      const finalPreparedTransaction = await transport.prepareTransaction(
        network,
        wallet,
        (await getWalletStorage(realm, wallet, true)) as WalletStorage<unknown>,
        { ...transaction },
        fee,
        true,
      );

      const signedTx = await network.signTransaction(
        {
          ...wallet,
          seed: {
            data: seed,
          },
        },
        finalPreparedTransaction.data,
      );

      return { seed, signedTx };
    },
    [transport, network, wallet, dispatch, pageInfo, realm, currency, getSeed],
  );

  const signEvmTransaction = useCallback(
    async (method: EvmRpcMethod, params: unknown[], domain: string, baseUrl: string) => {
      const result = await signEvmTransactionWithSeed(method, params, domain, baseUrl);
      return result?.signedTx;
    },
    [signEvmTransactionWithSeed],
  );

  const signAndSendEvmTransaction = useCallback(
    async (method: EvmRpcMethod, params: unknown[], domain: string, baseUrl: string) => {
      if (!isEVMNetwork(network)) {
        throw new Error(`Can't sign an EVM transaction with a non-EVM wallet`);
      }

      const result = await signEvmTransactionWithSeed(method, params, domain, baseUrl);

      if (result === undefined) {
        return;
      }

      if (isIgraCanonicalTransport(transport)) {
        return transport.broadcastCarrierTransaction(network, result.signedTx, result.seed, wallet.accountIdx);
      }

      return transport.broadcastTransaction(network, result.signedTx);
    },
    [network, signEvmTransactionWithSeed, transport, wallet.accountIdx],
  );

  return useMemo(
    () => ({
      signEvmMessage,
      signEvmTransaction,
      signAndSendEvmTransaction,
    }),
    [signEvmMessage, signEvmTransaction, signAndSendEvmTransaction],
  );
};

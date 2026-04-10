import type { RealmishWallet } from '@/onChain/wallets/base';
import type { SolanaHarmonyTransport, SolanaNetwork } from '@/onChain/wallets/solana';
import type { WalletStorage } from '@/onChain/wallets/walletState';
import { getWalletStorage } from '@/onChain/wallets/walletState';
import type { TransactionAccordionItem } from '@/screens/AppSignRequest/components/TransactionAccordion';
import type { SecuredKeychainContext } from '@/secureStore/SecuredKeychainProvider';

import { handleRedirect } from '../../connectAppWithWalletConnect/handleRedirect';

import { getWarningFromSimulation } from '../../utils';
import { navigateToSignGenericTransactionPage } from '../navigateToSignGenericTransactionPage';
import { responseRejected } from '../responseRejected';
import { sessionIsDeepLinked } from '../sessionIsDeepLinked';

import { adaptSolanaSignTransactionToDefinitionList } from './utils';

import type { SolanaSignAllTransactions } from './types';
import type { ReactNavigationDispatch } from '../../types';
import type { IWalletKit } from '@reown/walletkit/dist/types/types/client';
import type { SessionTypes, Verify } from '@walletconnect/types';
import type Realm from 'realm';

import { handleError } from '/helpers/errorHandler';
import loc from '/loc';

const MAX_BATCH_SIZE = 20;

function isValidBase64(str: string): boolean {
  if (str.length === 0) {
    return false;
  }
  try {
    atob(str);
    return true;
  } catch {
    return false;
  }
}

export async function handleSessionRequestAllTransactions({
  activeSessions,
  foundWallet,
  id,
  dispatch,
  network,
  realm,
  params,
  transport,
  topic,
  web3Wallet,
  getSeed,
  verified,
}: {
  activeSessions: Record<string, SessionTypes.Struct>;
  foundWallet: RealmishWallet;
  id: number;
  dispatch: ReactNavigationDispatch;
  network: SolanaNetwork;
  realm: Realm;
  topic: string;
  params: SolanaSignAllTransactions;
  transport: SolanaHarmonyTransport;
  web3Wallet: IWalletKit;
  getSeed: SecuredKeychainContext['getSeed'];
  verified: Verify.Context['verified'];
}) {
  const { transactions } = params;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    await web3Wallet.respondSessionRequest({ topic, response: responseRejected(id) });
    return handleError('Invalid params: transactions must be a non-empty array', 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
  }

  if (transactions.length > MAX_BATCH_SIZE) {
    await web3Wallet.respondSessionRequest({ topic, response: responseRejected(id) });
    return handleError(`Batch too large: ${transactions.length} exceeds max ${MAX_BATCH_SIZE}`, 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
  }

  for (const tx of transactions) {
    if (!isValidBase64(tx)) {
      await web3Wallet.respondSessionRequest({ topic, response: responseRejected(id) });
      return handleError('Invalid params: all transactions must be valid base64 strings', 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
    }
  }

  const walletStorage = (await getWalletStorage(realm, foundWallet, true)) as WalletStorage<unknown>;
  type SolanaPrepared = Awaited<ReturnType<SolanaHarmonyTransport['prepareTransaction']>>;
  const preparedTransactions: SolanaPrepared[] = [];

  for (const tx of transactions) {
    const prepared = await transport
      .prepareTransaction(network, foundWallet, walletStorage, {
        transaction: tx,
        dAppOrigin: verified.origin,
      })
      .catch((error: unknown) => {
        handleError(error, 'ERROR_CONTEXT_PLACEHOLDER');
        return undefined;
      });

    if (!prepared || prepared.isError) {
      await web3Wallet.respondSessionRequest({ topic, response: responseRejected(id) });
      return handleError('Failed to prepare one or more transactions in batch', 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
    }

    preparedTransactions.push(prepared);
  }

  const transactionsList: TransactionAccordionItem[] = transactions.map(tx => ({
    definitionList: adaptSolanaSignTransactionToDefinitionList({ transaction: tx }),
    preview: tx,
  }));

  const aggregatedPreventativeAction = preparedTransactions.reduce<(typeof preparedTransactions)[0]['preventativeAction']>((worst, tx) => {
    if (tx.preventativeAction === 'BLOCK') {
      return 'BLOCK';
    }
    if (tx.preventativeAction === 'WARN' && worst !== 'BLOCK') {
      return 'WARN';
    }
    return worst;
  }, preparedTransactions[0].preventativeAction);

  const aggregatedWarnings = preparedTransactions
    .flatMap((tx, i) =>
      (tx.warnings ?? []).map(w => ({
        ...w,
        message: transactions.length > 1 ? `[Tx ${i + 1}] ${w.message}` : w.message,
      })),
    )
    .filter(w => w.message);

  const warning = getWarningFromSimulation(aggregatedPreventativeAction, aggregatedWarnings.length > 0 ? aggregatedWarnings : undefined);

  const { approveSignRequest } = await navigateToSignGenericTransactionPage(
    dispatch,
    foundWallet,
    {
      imageUrl: activeSessions[topic].peer.metadata.icons[0],
      name: activeSessions[topic].peer.metadata.name,
      url: activeSessions[topic].peer.metadata.url,
    },
    [],
    transactionsList[0].definitionList,
    preparedTransactions[0],
    true,
    warning,
    transactionsList,
  );

  if (approveSignRequest) {
    try {
      const seed = await getSeed('sign');
      if (!seed) {
        await web3Wallet.respondSessionRequest({ topic, response: responseRejected(id) });
        return handleError('Missing seed', 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
      }

      const walletDataWithSeed = { ...foundWallet, seed: { data: seed } };
      const signedTransactions: string[] = [];

      for (const prepared of preparedTransactions) {
        const signed = await network.signTransaction(walletDataWithSeed, prepared.data);
        signedTransactions.push(signed);
      }

      const result = { transactions: signedTransactions };

      await web3Wallet.respondSessionRequest({ topic, response: { id, result, jsonrpc: '2.0' } });
      const isDeepLinked = sessionIsDeepLinked(realm, topic);
      await handleRedirect(activeSessions[topic], 'request_fulfilled', isDeepLinked);
    } catch (error) {
      await web3Wallet.respondSessionRequest({ topic, response: responseRejected(id) });
      return handleError(error, 'ERROR_CONTEXT_PLACEHOLDER', 'generic');
    }
  } else {
    await web3Wallet.respondSessionRequest({ topic, response: responseRejected(id) });
    return handleError('User rejected', 'ERROR_CONTEXT_PLACEHOLDER', { icon: 'plug-disconnected', text: loc.walletConnect.response_rejected });
  }
}

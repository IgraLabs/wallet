import { useCallback } from 'react';
import Realm from 'realm';

import { useRealmTransaction } from '../hooks/useRealmTransaction';
import { useRealm } from '../RealmContext';

import { REALM_TYPE_WALLET_CONNECT_TOPICS } from './schema';

import type { RealmWalletConnectTopics } from './schema';

export const useWalletConnectTopicsMutations = () => {
  const realm = useRealm();
  const { runInTransaction } = useRealmTransaction();

  const saveTopicToRealm = useCallback(
    (pairingTopic: string, topic: string, isDeepLinked: boolean) => {
      console.log('[useWalletConnectTopicsMutations] saving topic ' + topic);
      runInTransaction(() => {
        const existing = realm.objectForPrimaryKey<RealmWalletConnectTopics>(REALM_TYPE_WALLET_CONNECT_TOPICS, pairingTopic);
        if (existing) {
          console.log('[useWalletConnectTopicsMutations] topic already exists, skipping: ' + pairingTopic);
          return;
        }
        realm.create<RealmWalletConnectTopics>(
          REALM_TYPE_WALLET_CONNECT_TOPICS,
          {
            pairingTopic,
            topic,
            isDeepLinked,
          },
          Realm.UpdateMode.Never,
        );
      });
    },

    [realm, runInTransaction],
  );

  const deleteSession = async (topic: string): Promise<void> => {
    realm.write(() => {
      realm.delete(realm.objects<RealmWalletConnectTopics>(REALM_TYPE_WALLET_CONNECT_TOPICS).filtered('topic = $0', topic));
    });
  };

  return {
    saveTopicToRealm,
    deleteSession,
  };
};

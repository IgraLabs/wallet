import type { RealmWalletConnectTopics } from '@/realm/walletConnectTopics';
import { REALM_TYPE_WALLET_CONNECT_TOPICS } from '@/realm/walletConnectTopics';

import type Realm from 'realm';

export const sessionIsDeepLinked = (realm: Realm, topic: string): boolean => {
  const realmSessionTopics = realm.objects<RealmWalletConnectTopics>(REALM_TYPE_WALLET_CONNECT_TOPICS).filtered('topic = $0', topic);
  if (realmSessionTopics.length === 0 || !realmSessionTopics[0]) {
    return false;
  }
  return realmSessionTopics[0].isDeepLinked;
};

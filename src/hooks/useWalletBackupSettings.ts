import { useMemo } from 'react';

import { RealmSettingsKey, useSettingsByKey, useSettingsMutations } from '@/realm/settings';

import { isCloudBackupCreationEnabled, isPasskeySupported } from '/modules/cloud-backup';

export const useWalletBackupSettings = () => {
  const { setCloudBackupCompleted, setCloudBackupDismissed, setManualBackupDismissed, setCloudBackupIosWarningDismissed } = useSettingsMutations();

  const cloudBackupCredentialID = useSettingsByKey(RealmSettingsKey.cloudBackupCredentialID);
  const isManualBackupCompleted = !!useSettingsByKey(RealmSettingsKey.isWalletBackupDone);
  const isCloudBackupDismissed = !!useSettingsByKey(RealmSettingsKey.isCloudBackupDismissed);
  const isManualBackupDismissed = !!useSettingsByKey(RealmSettingsKey.isManualBackupDismissed);
  const isCloudBackupIosWarningDismissed = !!useSettingsByKey(RealmSettingsKey.isCloudBackupIosWarningDismissed);

  return useMemo(() => {
    const isCloudBackupSupported = isPasskeySupported;
    const isCloudBackupCreationSupported = isPasskeySupported && isCloudBackupCreationEnabled;
    const isCloudBackupCompleted = !!cloudBackupCredentialID;
    const isCloudBackupNeeded = isCloudBackupCreationSupported && !isCloudBackupCompleted;
    const isCloudBackupSuggested = isCloudBackupNeeded && !isCloudBackupDismissed;

    const isManualBackupNeeded = !isManualBackupCompleted;
    const isManualBackupSuggested = isCloudBackupCompleted && isManualBackupNeeded && !isManualBackupDismissed;

    const isCloudBackupIosWarningSuggested = isCloudBackupCompleted && !isCloudBackupIosWarningDismissed;

    const isAnyBackupCompleted = isManualBackupCompleted || isCloudBackupCompleted;
    const isAnyBackupNeeded = isCloudBackupIosWarningSuggested || isManualBackupNeeded || isCloudBackupNeeded;
    const isAnyBackupSuggested = isCloudBackupIosWarningSuggested || isManualBackupSuggested || isCloudBackupSuggested;

    return {
      isCloudBackupSupported,
      isCloudBackupCreationSupported,
      isCloudBackupCompleted,
      isCloudBackupNeeded,
      isCloudBackupSuggested,

      setCloudBackupCompleted,
      setCloudBackupDismissed,

      isManualBackupNeeded,
      isManualBackupCompleted,
      isManualBackupSuggested,

      setManualBackupDismissed,

      isAnyBackupCompleted,
      isAnyBackupNeeded,
      isAnyBackupSuggested,

      isCloudBackupIosWarningSuggested,
      setCloudBackupIosWarningDismissed,
    };
  }, [
    cloudBackupCredentialID,
    isCloudBackupDismissed,
    isManualBackupCompleted,
    isManualBackupDismissed,
    isCloudBackupIosWarningDismissed,
    setCloudBackupCompleted,
    setCloudBackupDismissed,
    setManualBackupDismissed,
    setCloudBackupIosWarningDismissed,
  ]);
};

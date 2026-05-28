import { useCallback, useMemo } from 'react';
import { Image, ScrollView, StyleSheet } from 'react-native';

import { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { CardWarning } from '@/components/CardWarning';
import { GradientScreenView } from '@/components/Gradients';
import { Menu, useMenu } from '@/components/Menu';
import { SvgIcon } from '@/components/SvgIcon';
import { BackupCompletionBadge } from '@/components/WalletBackup';
import { BackupMethodSelector } from '@/components/WalletBackup/BackupMethodSelector';
import { WalletItem } from '@/components/WalletItem';
import { useHeaderTitle } from '@/hooks/useHeaderTitle';
import { useWalletBackupSettings } from '@/hooks/useWalletBackupSettings';
import { useAccounts } from '@/realm/accounts';
import { Routes } from '@/Routes';
import { navigationStyle } from '@/utils/navigationStyle';
import { safelyAnimateLayout } from '@/utils/safeLayoutAnimation';

import { SettingsItem, SettingsSectionHeader } from '../components';

import { WalletBackupWarning } from '../walletBackup';

import type { SettingsNavigationProps } from '../SettingsRouter';

import { showAlert } from '/helpers/showAlert';
import loc from '/loc';

export const ManageWalletsScreen = ({ navigation }: SettingsNavigationProps<'ManageWallets'>) => {
  const accounts = useAccounts();
  const { navigate } = navigation;

  const {
    isCloudBackupSupported,
    isCloudBackupCreationSupported,
    isCloudBackupSuggested,
    isCloudBackupCompleted,
    isManualBackupCompleted,
    isAnyBackupCompleted,
    isAnyBackupSuggested,
    isCloudBackupIosWarningSuggested,
    setCloudBackupIosWarningDismissed,
  } = useWalletBackupSettings();

  useHeaderTitle(isCloudBackupSupported ? loc.settings.walletsAndBackups : loc.settings.manageWallets);

  const renderAccounts = useCallback(() => {
    return accounts.map((account, index) => {
      const isLast = index === accounts.length - 1;
      return <WalletItem account={account} isLast={isLast} key={account + ' ' + index} testID={account.accountCustomName} />;
    });
  }, [accounts]);

  const handleSecretRecoveryPhrasePress = () => {
    if (!isManualBackupCompleted) {
      navigate(isCloudBackupSupported ? Routes.SettingsDisplaySeed : Routes.SettingsWalletBackup);
    } else {
      navigate(Routes.SettingsDisplaySeed);
    }
  };

  const navigateToCloudBackup = () => {
    navigate(Routes.SettingsWalletCloudBackup);
  };

  const showCloudBackupSection = isCloudBackupSupported && isAnyBackupCompleted && (isCloudBackupCompleted || isCloudBackupCreationSupported);

  const { isShown } = useMenu();

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(isShown ? '0deg' : '180deg', { duration: 200 }) }],
  }));

  const navigateToDeleteConfirmation = () => {
    navigation.navigate(Routes.SettingsWalletCloudBackupDelete);
  };

  const handleDismissIosWarning = async () => {
    const confirmed = await showAlert(
      loc.cloudBackupIosWarning.confirmTitle,
      loc.cloudBackupIosWarning.confirmDesc,
      loc.cloudBackupIosWarning.confirmYes,
      loc.cloudBackupIosWarning.confirmNo,
    );
    if (!confirmed) {
      return;
    }
    safelyAnimateLayout();
    setCloudBackupIosWarningDismissed();
  };

  const backupIcon = useMemo(() => {
    if (!isAnyBackupCompleted || isCloudBackupSuggested) {
      return null;
    }
    return <BackupCompletionBadge completed={isManualBackupCompleted} />;
  }, [isAnyBackupCompleted, isCloudBackupSuggested, isManualBackupCompleted]);

  return (
    <GradientScreenView>
      <ScrollView style={styles.container}>
        {!!showCloudBackupSection && (
          <>
            <BackupMethodSelector
              key={String(isCloudBackupCompleted)}
              containerStyle={styles.cloudBackup}
              icon={<Image source={require('@/assets/images/common/iCloud.png')} />}
              onPress={navigateToCloudBackup}
              title={isCloudBackupCompleted ? loc.walletBackupSelection.backupWithICloudCompleted : loc.walletBackupSelection.backupWithICloud}
              subtitle={loc.walletBackupSelection.iCloudDescLong}
              subtitleShort={isCloudBackupCompleted ? loc.walletBackupSelection.iCloudDescCompletedShort : loc.walletBackupSelection.iCloudDescShort}
              showCompletionState
              completionIconSize={24}
              completed={isCloudBackupCompleted}
              completionBadge={isCloudBackupIosWarningSuggested ? <SvgIcon name="error" color="yellow500" size={24} /> : undefined}
              rightElement={
                !!isCloudBackupCompleted && (
                  <Menu
                    menuXOffset={12}
                    type="context"
                    items={[
                      {
                        title: loc.walletCloudBackupDelete.title,
                        icon: 'trash',
                        onPress: navigateToDeleteConfirmation,
                      },
                    ]}>
                    <SvgIcon name="chevron-up" style={chevronStyle} />
                  </Menu>
                )
              }
              centerIcon
            />
            {!!isCloudBackupIosWarningSuggested && (
              <CardWarning
                title={loc.cloudBackupIosWarning.title}
                description={loc.cloudBackupIosWarning.description}
                type="warning"
                onClose={handleDismissIosWarning}
                style={styles.iosWarning}
              />
            )}
          </>
        )}

        {isAnyBackupCompleted && isAnyBackupSuggested && <WalletBackupWarning style={styles.backupSuggested} />}
        <SettingsSectionHeader title={loc.settings.wallets} style={[isAnyBackupSuggested && styles.walletHeaderTitle]} />
        {!isAnyBackupCompleted && <WalletBackupWarning />}
        <SettingsItem
          isHighlighted
          isFirst
          title={loc.settings.secretRecoveryPhrase}
          onPress={handleSecretRecoveryPhrasePress}
          containerStyle={styles.walletHeader}
          testID="SecretRecoveryPhraseButton">
          {backupIcon}
        </SettingsItem>
        {renderAccounts()}
      </ScrollView>
    </GradientScreenView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
  },
  cloudBackup: {
    marginTop: 16,
  },
  iosWarning: {
    marginTop: 8,
  },
  backupSuggested: {
    marginTop: 16,
  },
  walletHeaderTitle: {
    marginTop: 24,
  },
  walletHeader: {
    marginBottom: 1,
  },
});

ManageWalletsScreen.navigationOptions = navigationStyle({ headerTransparent: true });

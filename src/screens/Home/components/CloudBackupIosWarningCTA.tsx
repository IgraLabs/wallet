import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { CardWarning } from '@/components/CardWarning';
import { useWalletBackupSettings } from '@/hooks/useWalletBackupSettings';
import { Routes } from '@/Routes';
import { safelyAnimateLayout } from '@/utils/safeLayoutAnimation';

import { showAlert } from '/helpers/showAlert';
import loc from '/loc';

export const CloudBackupIosWarningCTA = () => {
  const navigation = useNavigation();
  const { setCloudBackupIosWarningDismissed } = useWalletBackupSettings();
  const [dismissed, setDismissed] = useState<boolean>(false);

  const handlePress = () => {
    navigation.navigate(Routes.Settings, { screen: Routes.SettingsDisplaySeed });
  };

  const handleClose = async () => {
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
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut.duration(100)}>
      <CardWarning
        title={loc.cloudBackupIosWarning.title}
        description={loc.cloudBackupIosWarning.description}
        type="warning"
        buttonText={loc.cloudBackupIosWarning.button}
        onPress={handlePress}
        onClose={handleClose}
        style={styles.card}
        testID="CloudBackupIosWarningCTA"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
});

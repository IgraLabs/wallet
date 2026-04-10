import type React from 'react';

import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AccordionItem } from '@/components/AccordionItem';
import { AddressDisplay } from '@/components/AddressDisplay';
import { Label } from '@/components/Label';
import { SvgIcon } from '@/components/SvgIcon';
import { Touchable } from '@/components/Touchable';
import { useTheme } from '@/theme/themes';

import loc from '/loc';
import type { DefinitionList } from '/modules/wallet-connect/types';

const ANIMATION_DURATION = 150;
const ACCORDION_RADIUS = 12;
const PREVIEW_LENGTH = 8;

export type TransactionAccordionItem = {
  definitionList: DefinitionList;
  preview: string;
};

type Props = {
  transactions: TransactionAccordionItem[];
};

export const TransactionAccordion: React.FC<Props> = ({ transactions }) => {
  return (
    <View style={styles.container}>
      {transactions.map((tx, index) => (
        <TransactionSection
          key={index}
          index={index}
          total={transactions.length}
          preview={tx.preview}
          definitionList={tx.definitionList}
          isFirst={index === 0}
          isLast={index === transactions.length - 1}
        />
      ))}
    </View>
  );
};

type SectionProps = {
  index: number;
  total: number;
  preview: string;
  definitionList: DefinitionList;
  isFirst: boolean;
  isLast: boolean;
};

const TransactionSection: React.FC<SectionProps> = ({ index, total, preview, definitionList, isFirst, isLast }) => {
  const isExpanded = useSharedValue(false);
  const { colors } = useTheme();

  const onToggle = () => {
    isExpanded.value = !isExpanded.value;
  };

  const containerBgStyle = useAnimatedStyle(
    () => ({
      backgroundColor: withTiming(isExpanded.value ? colors.purple_20 : colors.purple_10, { duration: ANIMATION_DURATION }),
    }),
    [],
  );

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(isExpanded.value ? '180deg' : '0deg', { duration: ANIMATION_DURATION }) }],
  }));

  const truncatedPreview = preview.length > PREVIEW_LENGTH ? preview.slice(0, PREVIEW_LENGTH) + '…' : preview;

  return (
    <Animated.View style={[styles.section, containerBgStyle, isFirst && styles.roundedTop, isLast && styles.roundedBottom]}>
      <Touchable onPress={onToggle} style={styles.header}>
        <View style={styles.headerContent}>
          <Label type="boldCaption1">{`Transaction ${index + 1} of ${total}`}</Label>
          <Label type="regularCaption1" color="light50" numberOfLines={1}>
            {truncatedPreview}
          </Label>
        </View>
        <SvgIcon name="chevron-down" style={chevronStyle} />
      </Touchable>
      <AccordionItem isExpanded={isExpanded} duration={ANIMATION_DURATION}>
        <View style={styles.details}>
          {definitionList.map(({ title, description }, i) =>
            description !== '' ? (
              <View style={styles.listItem} key={title + '_' + i}>
                <Label type="regularCaption1" color="light50" style={styles.titleText}>
                  {title}
                </Label>
                {title === loc.appSignRequest.contractAddress ? (
                  <AddressDisplay address={description} />
                ) : (
                  <Label type="boldBody" color="light100" style={styles.bodyText}>
                    {description}
                  </Label>
                )}
              </View>
            ) : null,
          )}
        </View>
      </AccordionItem>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 2,
  },
  section: {
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    alignItems: 'center',
    marginRight: 4,
  },
  roundedTop: {
    borderTopLeftRadius: ACCORDION_RADIUS,
    borderTopRightRadius: ACCORDION_RADIUS,
  },
  roundedBottom: {
    borderBottomLeftRadius: ACCORDION_RADIUS,
    borderBottomRightRadius: ACCORDION_RADIUS,
  },
  details: {
    padding: 12,
    paddingTop: 0,
    gap: 12,
  },
  listItem: {
    marginBottom: 4,
  },
  titleText: {
    marginBottom: 4,
  },
  bodyText: {
    lineHeight: 19.5,
    fontSize: 15,
  },
});

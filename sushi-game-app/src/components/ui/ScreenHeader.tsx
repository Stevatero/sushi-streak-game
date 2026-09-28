import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import { typography, useAppTheme } from '../../theme/theme';

interface ScreenHeaderProps {
  title: string;
  kanji?: string;
  onBack?: () => void;
  backIcon?: string;
  right?: React.ReactNode;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, kanji, onBack, backIcon = 'arrow-left', right }) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      {onBack ? (
        <IconButton
          icon={backIcon}
          accessibilityLabel="Indietro"
          size={24}
          iconColor={colors.onSurface}
          onPress={onBack}
          style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
        />
      ) : null}
      <View style={styles.titles}>
        <Text style={[typography.title, { color: colors.onBackground }]} accessibilityRole="header">
          {title}
        </Text>
        {kanji ? (
          <Text style={[typography.kanji, { color: colors.primary }]} importantForAccessibility="no">
            {kanji}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    minHeight: 56,
  },
  back: {
    marginLeft: 0,
    marginRight: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titles: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
});

export default ScreenHeader;

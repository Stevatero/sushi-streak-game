import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { typography, useAppTheme } from '../../theme/theme';

interface SectionTitleProps {
  label: string;
  // Didascalia giapponese (es. 順位 per la classifica)
  kanji?: string;
  right?: React.ReactNode;
  // Titolo centrato (senza contenuto a destra), es. sopra il punteggio della partita
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SectionTitle: React.FC<SectionTitleProps> = ({ label, kanji, right, centered = false, style }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.row, centered && styles.centered, style]}>
      <Text style={[typography.label, { color: colors.onSurfaceVariant }]} accessibilityRole="header">
        {label}
      </Text>
      {kanji ? (
        <Text style={[typography.kanji, styles.kanji, { color: colors.primary }]} importantForAccessibility="no">
          {kanji}
        </Text>
      ) : null}
      {centered ? null : (
        <>
          <View style={styles.spacer} />
          {right}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 20,
  },
  centered: {
    justifyContent: 'center',
  },
  kanji: {
    marginLeft: 8,
    opacity: 0.85,
  },
  spacer: {
    flex: 1,
  },
});

export default SectionTitle;

import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { fonts, useAppTheme } from '../../theme/theme';

interface HankoProps {
  // Uno o due caratteri: kanji o numeri
  label: string;
  size?: number;
  color?: string;
  textColor?: string;
  shape?: 'square' | 'circle';
  // Leggera inclinazione, come un timbro apposto a mano
  tilt?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const isLatin = (text: string) => /^[\x20-\x7E°]+$/.test(text);

// Timbro hanko: sigillo rosso con doppio bordo, usato per logo, posizioni e vittoria
const Hanko: React.FC<HankoProps> = ({
  label,
  size = 40,
  color,
  textColor,
  shape = 'square',
  tilt = -4,
  style,
  accessibilityLabel,
}) => {
  const theme = useAppTheme();
  const background = color ?? theme.colors.primary;
  const ink = textColor ?? theme.colors.onPrimary;
  const radius = shape === 'circle' ? size / 2 : size * 0.24;
  const inset = Math.max(2, size * 0.08);
  const chars = [...label].length;
  const latin = isLatin(label);
  const fontSize = size * (chars <= 1 ? 0.5 : chars === 2 ? (latin ? 0.4 : 0.3) : 0.26);

  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.seal,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: background,
          transform: [{ rotate: `${tilt}deg` }],
        },
        style,
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            top: inset,
            left: inset,
            right: inset,
            bottom: inset,
            borderRadius: Math.max(0, radius - inset),
            borderColor: ink,
          },
        ]}
      />
      <Text
        style={[
          styles.text,
          { color: ink, fontSize, lineHeight: fontSize * 1.15 },
          latin ? { fontFamily: fonts.black } : styles.kanji,
        ]}
        allowFontScaling={false}
        importantForAccessibility="no"
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  seal: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    position: 'absolute',
    borderWidth: 1.2,
    opacity: 0.55,
  },
  text: {
    textAlign: 'center',
    includeFontPadding: false,
  },
  kanji: {
    fontWeight: '700',
  },
});

export default Hanko;

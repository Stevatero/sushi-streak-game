import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { fonts, radii, useAppTheme } from '../../theme/theme';

// danger: azione distruttiva secondaria (solo testo); destructive: azione distruttiva principale (pieno)
type Variant = 'primary' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'destructive';

interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  // Piccola didascalia in giapponese accanto all'etichetta
  kanji?: string;
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AppButton: React.FC<AppButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  icon,
  kanji,
  size = 'md',
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
  testID,
}) => {
  const theme = useAppTheme();
  const { colors } = theme;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;

  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    tonal: { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer, border: colors.secondaryContainer },
    outline: { bg: 'transparent', fg: colors.onSurface, border: colors.outline },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: 'transparent', fg: colors.error, border: 'transparent' },
    destructive: { bg: colors.error, fg: colors.onError, border: colors.error },
  };
  const { bg, fg, border } = palette[variant];

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={inactive}
      onPressIn={() => {
        scale.set(withSpring(0.96, { damping: 20, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={[
        styles.button,
        size === 'lg' ? styles.large : styles.medium,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : 1 },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <MaterialCommunityIcons name={icon} size={size === 'lg' ? 22 : 19} color={fg} /> : null}
          <Text style={[styles.label, size === 'lg' && styles.labelLarge, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
          {kanji ? <Text style={[styles.kanji, { color: fg }]}>{kanji}</Text> : null}
        </View>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  medium: {
    minHeight: 48,
  },
  large: {
    minHeight: 58,
    borderRadius: radii.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 15.5,
    letterSpacing: 0.2,
  },
  labelLarge: {
    fontSize: 17,
  },
  kanji: {
    fontSize: 12,
    opacity: 0.7,
    letterSpacing: 1,
  },
});

export default AppButton;

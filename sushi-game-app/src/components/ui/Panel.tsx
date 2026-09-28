import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { radii, useAppTheme } from '../../theme/theme';

interface PanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  // glass: semitrasparente, per stare sopra la pila di sushi; accent: bordo vermiglione a sinistra
  tone?: 'default' | 'glass' | 'accent';
  testID?: string;
}

// Superficie di base: bordo sottile e ombra morbida invece di elevazioni marcate
const Panel: React.FC<PanelProps> = ({ children, style, tone = 'default', testID }) => {
  const { colors } = useAppTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.panel,
        {
          backgroundColor: tone === 'glass' ? colors.glass : colors.surface,
          borderColor: colors.outlineVariant,
          shadowColor: colors.shadow,
        },
        tone === 'accent' && { borderLeftColor: colors.primary, borderLeftWidth: 4 },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    elevation: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
});

export default Panel;

import React, { forwardRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { fonts, radii, typography, useAppTheme } from '../../theme/theme';

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  // Elemento a destra dell'etichetta (es. "Genera")
  accessory?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

// Campo di testo con etichetta sopra e sfondo pieno; il bordo si colora quando è attivo
const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, accessory, containerStyle, style, onFocus, onBlur, ...inputProps },
  ref
) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>{label}</Text>
        {accessory}
      </View>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.onSurfaceDisabled}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.onSurface,
            borderColor: focused ? colors.primary : 'transparent',
          },
          style,
        ]}
      />
      {hint ? <Text style={[typography.caption, styles.hint, { color: colors.onSurfaceVariant }]}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  input: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontFamily: fonts.medium,
    fontSize: 17,
  },
  hint: {
    marginTop: 6,
  },
});

export default Field;

import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radii, typography, useAppTheme } from '../../theme/theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  kanji?: string;
  children: React.ReactNode;
  // Chiusura toccando lo sfondo (disattivabile per i passaggi importanti)
  dismissable?: boolean;
  // Livello decorativo disegnato sopra il pannello (es. i petali della vittoria)
  overlay?: React.ReactNode;
}

// Pannello che sale dal basso, usato per tutte le finestre modali dell'app
const Sheet: React.FC<SheetProps> = ({ visible, onClose, title, kanji, children, dismissable = true, overlay }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(60);

  useEffect(() => {
    if (visible) {
      offset.value = 60;
      offset.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    }
  }, [visible, offset]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }]}
            onPress={dismissable ? onClose : undefined}
            accessibilityLabel="Chiudi"
            accessibilityRole="button"
          />
          <View style={styles.spacer} pointerEvents="box-none" />
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: 24 + insets.bottom,
                borderColor: colors.outlineVariant,
              },
              sheetStyle,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.outline }]} />
            {title ? (
              <View style={styles.header}>
                <Text style={[typography.title, { color: colors.onSurface }]} accessibilityRole="header">
                  {title}
                </Text>
                {kanji ? (
                  <Text style={[typography.kanji, { color: colors.primary }]} importantForAccessibility="no">
                    {kanji}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {children}
          </Animated.View>
          {overlay}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 22,
    paddingTop: 10,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 16,
  },
});

export default Sheet;

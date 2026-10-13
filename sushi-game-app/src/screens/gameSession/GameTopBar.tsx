import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fonts, radii, typography, useAppTheme } from '../../theme/theme';

interface GameTopBarProps {
  title: string;
  status: string;
  statusColor: string;
  // Sessione condivisibile (attiva): il titolo apre l'invito
  onShare?: () => void;
  onBack: () => void;
  onSettings: () => void;
  topInset: number;
}

// Barra superiore: uscita, nome della sessione con lo stato della connessione, impostazioni
const GameTopBar: React.FC<GameTopBarProps> = ({
  title,
  status,
  statusColor,
  onShare,
  onBack,
  onSettings,
  topInset,
}) => {
  const { colors } = useAppTheme();
  const roundStyle = [styles.roundIcon, { backgroundColor: colors.glass, borderColor: colors.outlineVariant }];
  return (
    <View style={[styles.bar, { paddingTop: topInset + 6 }]}>
      <IconButton
        icon="arrow-left"
        accessibilityLabel="Esci dalla partita"
        iconColor={colors.onSurface}
        onPress={onBack}
        style={roundStyle}
      />
      <Pressable
        onPress={onShare}
        disabled={!onShare}
        accessibilityRole="button"
        accessibilityLabel="Condividi la sessione"
        style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.outlineVariant }]}
      >
        <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={[typography.caption, styles.shrink, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
            {onShare ? `${status} · Tocca per invitare` : status}
          </Text>
          {onShare ? <MaterialCommunityIcons name="share-variant" size={13} color={colors.primary} /> : null}
        </View>
      </Pressable>
      <IconButton
        icon="cog-outline"
        accessibilityLabel="Impostazioni"
        iconColor={colors.onSurface}
        onPress={onSettings}
        style={roundStyle}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  roundIcon: {
    borderWidth: StyleSheet.hairlineWidth,
    margin: 0,
  },
  // Nome della sessione e stato centrati tra i due pulsanti rotondi
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 1.2,
    textAlign: 'center',
    maxWidth: '100%',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  shrink: {
    flexShrink: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});

export default GameTopBar;

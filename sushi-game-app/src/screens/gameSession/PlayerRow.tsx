import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Player } from '../../store/gameStore';
import { fonts, radii, useAppTheme } from '../../theme/theme';
import RankBadge from '../../components/RankBadge';
import Tag from '../../components/ui/Tag';

interface PlayerRowProps {
  player: Player;
  rank: number;
  isMe: boolean;
  isHost: boolean;
  // Solo l'host, sulla classifica dal vivo: tocco per rimuovere il giocatore
  onPress?: () => void;
}

const PlayerRow: React.FC<PlayerRowProps> = ({ player, rank, isMe, isHost, onPress }) => {
  const { colors } = useAppTheme();
  const textColor = isMe ? colors.onPrimaryContainer : colors.onSurface;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Rimuovi il giocatore dalla partita' : undefined}
      style={({ pressed }) => [
        styles.row,
        isMe && { backgroundColor: colors.primaryContainer },
        pressed && { backgroundColor: colors.surfaceVariant },
      ]}
    >
      <RankBadge rank={rank} />
      <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
        {player.name}
        {isMe ? ' (tu)' : ''}
      </Text>
      {isHost ? (
        <MaterialCommunityIcons
          name="crown-outline"
          size={16}
          color={isMe ? colors.onPrimaryContainer : colors.gold}
          accessibilityLabel="Host"
        />
      ) : null}
      {player.finished ? (
        <Tag label="Finito" kanji="完" color={colors.onTertiaryContainer} background={colors.tertiaryContainer} />
      ) : null}
      <Text style={[styles.score, { color: textColor }]}>{player.score}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  name: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  score: {
    fontFamily: fonts.bold,
    fontSize: 18,
    minWidth: 32,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});

export default PlayerRow;

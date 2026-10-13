import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Player } from '../../store/gameStore';
import { plural } from '../../utils/plural';
import { podiumOrder, rankOf } from '../../utils/ranking';
import { fonts, radii, typography, useAppTheme } from '../../theme/theme';
import AppButton from '../../components/ui/AppButton';
import Sheet from '../../components/ui/Sheet';
import RankBadge from '../../components/RankBadge';
import PlayerRow from './PlayerRow';

interface FinalLeaderboardSheetProps {
  visible: boolean;
  onClose: () => void;
  gameEnded: boolean;
  // Classifica ordinata
  players: Player[];
  playerId: string;
  hostId: string | null;
  winnerText: string | null;
  endNote?: string;
  overlay?: React.ReactNode;
  onShareResult: () => void;
  onRestaurant: () => void;
  onNewGame: () => void;
}

// Classifica con podio: finale a partita chiusa, attuale mentre gli altri mangiano ancora
const FinalLeaderboardSheet: React.FC<FinalLeaderboardSheetProps> = ({
  visible,
  onClose,
  gameEnded,
  players,
  playerId,
  hostId,
  winnerText,
  endNote,
  overlay,
  onShareResult,
  onRestaurant,
  onNewGame,
}) => {
  const { colors } = useAppTheme();
  const podium = podiumOrder(players);
  const showPodium = podium.length > 1;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={gameEnded ? 'Classifica finale' : 'Classifica attuale'}
      kanji="結果"
      overlay={overlay}
    >
      {gameEnded && winnerText ? (
        <Text style={[typography.bodyStrong, styles.winner, { color: colors.primary }]}>{winnerText}</Text>
      ) : null}
      {gameEnded && endNote ? (
        <Text style={[typography.caption, styles.note, { color: colors.onSurfaceVariant }]}>{endNote}</Text>
      ) : null}
      {showPodium ? (
        <View style={styles.podium}>
          {podium.map((p) => {
            const rank = rankOf(players, p.score);
            const height = rank === 1 ? 86 : rank === 2 ? 64 : 48;
            return (
              <View key={p.id} style={styles.podiumColumn}>
                <Text style={[styles.podiumName, { color: colors.onSurface }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
                  {plural(p.score, 'pezzo', 'pezzi')}
                </Text>
                <View
                  style={[
                    styles.podiumBlock,
                    { height, backgroundColor: p.id === playerId ? colors.primaryContainer : colors.surfaceVariant },
                  ]}
                >
                  <RankBadge rank={rank} size={32} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <FlatList
        data={showPodium ? players.slice(3) : players}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PlayerRow
            player={item}
            rank={rankOf(players, item.score)}
            isMe={item.id === playerId}
            isHost={item.id === hostId}
          />
        )}
        style={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <Text style={[typography.caption, styles.savedNote, { color: colors.onSurfaceVariant }]}>
        La partita viene salvata automaticamente nello storico.
      </Text>

      <View style={styles.buttons}>
        {gameEnded ? (
          <AppButton
            label="Condividi il risultato"
            icon="image-outline"
            onPress={onShareResult}
            testID="final-share-result"
          />
        ) : null}
        <AppButton label="Nuova partita" icon="plus" variant={gameEnded ? 'tonal' : 'primary'} onPress={onNewGame} />
        <View style={styles.row}>
          <AppButton
            label="Ristorante"
            icon="map-marker-outline"
            variant="outline"
            onPress={onRestaurant}
            style={styles.flex}
          />
          <AppButton label="Chiudi" variant="ghost" onPress={onClose} style={styles.flex} />
        </View>
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  winner: {
    marginBottom: 4,
  },
  note: {
    marginBottom: 8,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  podiumColumn: {
    flex: 1,
    alignItems: 'center',
  },
  podiumName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  podiumBlock: {
    alignSelf: 'stretch',
    marginTop: 6,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    alignItems: 'center',
    paddingTop: 10,
  },
  list: {
    maxHeight: 200,
  },
  separator: {
    height: 2,
  },
  savedNote: {
    textAlign: 'center',
    marginTop: 10,
  },
  buttons: {
    gap: 10,
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});

export default FinalLeaderboardSheet;

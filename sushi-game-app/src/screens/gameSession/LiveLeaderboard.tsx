import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Player } from '../../store/gameStore';
import { plural } from '../../utils/plural';
import { rankOf } from '../../utils/ranking';
import { typography, useAppTheme } from '../../theme/theme';
import AppButton from '../../components/ui/AppButton';
import Panel from '../../components/ui/Panel';
import SectionTitle from '../../components/ui/SectionTitle';
import PlayerRow from './PlayerRow';

interface LiveLeaderboardProps {
  // Classifica ordinata, con il punteggio del giocatore che include i pezzi in attesa
  players: Player[];
  playerId: string;
  hostId: string | null;
  // Solo l'host durante la partita: rimozione dei giocatori e chiusura per tutti
  onKick?: (player: Player) => void;
  onEndSession?: () => void;
}

// Classifica in tempo reale sopra la pila di sushi
const LiveLeaderboard: React.FC<LiveLeaderboardProps> = ({ players, playerId, hostId, onKick, onEndSession }) => {
  const { colors } = useAppTheme();
  const canKick = !!onKick && players.length > 1;
  return (
    <Panel tone="glass" style={styles.panel}>
      <SectionTitle
        label="Classifica"
        kanji="順位"
        right={
          <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
            {plural(players.length, 'giocatore', 'giocatori')}
          </Text>
        }
      />
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMe = item.id === playerId;
          return (
            <PlayerRow
              player={item}
              rank={rankOf(players, item.score)}
              isMe={isMe}
              isHost={item.id === hostId}
              onPress={onKick && !isMe ? () => onKick(item) : undefined}
            />
          );
        }}
        style={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      {canKick ? (
        <Text style={[typography.caption, styles.hint, { color: colors.onSurfaceVariant }]}>
          Gestisci tu la partita: tocca un giocatore per rimuoverlo.
        </Text>
      ) : null}
      {onEndSession ? (
        <AppButton
          label="Termina la partita per tutti"
          icon="flag-checkered"
          variant="ghost"
          onPress={onEndSession}
          style={styles.endButton}
        />
      ) : null}
    </Panel>
  );
};

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 16,
    paddingBottom: 10,
  },
  list: {
    maxHeight: 196,
  },
  separator: {
    height: 2,
  },
  hint: {
    marginTop: 6,
    textAlign: 'center',
  },
  endButton: {
    minHeight: 40,
    marginTop: 2,
  },
});

export default LiveLeaderboard;

import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { plural } from '../utils/plural';
import { podiumOrder, rankOf, RankedPlayer, sortByScore, winnerText, winnersOf } from '../utils/ranking';
import { fonts, radii, typography, useAppTheme } from '../theme/theme';
import Hanko from './ui/Hanko';
import RankBadge from './RankBadge';
import Seigaiha from './ui/Seigaiha';

export interface ResultCardProps {
  sessionName: string;
  // Data della partita già formattata
  dateLabel: string;
  restaurant?: string;
  players: RankedPlayer[];
  // Larghezza della card (e dell'immagine): quella disponibile nel pannello
  width: number;
}

// Righe sotto il podio: oltre, un riepilogo "+N altri" mantiene la card compatta
const MAX_EXTRA_ROWS = 5;

// Card del risultato da condividere come immagine: podio, vincitore, ristorante e data.
// collapsable={false}: la vista deve esistere davvero (non appiattita) per poterla catturare
const ResultCard = forwardRef<View, ResultCardProps>(function ResultCard(
  { sessionName, dateLabel, restaurant, players, width },
  ref
) {
  const { colors } = useAppTheme();
  const sorted = sortByScore(players);
  const podium = podiumOrder(sorted);
  const others = sorted.slice(podium.length);
  const shown = others.slice(0, MAX_EXTRA_ROWS);
  const hidden = others.length - shown.length;
  const hasWinner = winnersOf(players).length > 0;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width, backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
    >
      <Seigaiha style={styles.pattern} fadeTo={colors.surface} />
      <View style={styles.header}>
        <Hanko label="寿司" size={38} />
        <View style={styles.flex}>
          <Text style={[styles.brand, { color: colors.onSurface }]}>Sushi Streak</Text>
          <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{dateLabel}</Text>
        </View>
        <Hanko label="勝" size={38} tilt={6} color={hasWinner ? colors.gold : colors.surfaceVariant} />
      </View>

      <Text style={[styles.session, { color: colors.onSurface }]} numberOfLines={1}>
        {sessionName}
      </Text>
      {restaurant ? (
        <View style={styles.inline}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.secondary} />
          <Text style={[typography.caption, { color: colors.secondary }]} numberOfLines={1}>
            {restaurant}
          </Text>
        </View>
      ) : null}
      <Text style={[typography.bodyStrong, styles.winner, { color: colors.primary }]}>{winnerText(players)}</Text>

      {podium.length > 1 ? (
        <View style={styles.podium}>
          {podium.map((p) => {
            const rank = rankOf(players, p.score);
            const height = rank === 1 ? 70 : rank === 2 ? 52 : 40;
            return (
              <View key={p.id} style={styles.podiumColumn}>
                <Text style={[styles.podiumName, { color: colors.onSurface }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>
                  {plural(p.score, 'pezzo', 'pezzi')}
                </Text>
                <View style={[styles.podiumBlock, { height, backgroundColor: colors.surfaceVariant }]}>
                  <RankBadge rank={rank} size={28} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {(podium.length > 1 ? shown : sorted).map((p) => (
        <View key={p.id} style={styles.row}>
          <RankBadge rank={rankOf(players, p.score)} size={24} />
          <Text style={[styles.rowName, { color: colors.onSurface }]} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={[styles.rowScore, { color: colors.onSurface }]}>{p.score}</Text>
        </View>
      ))}
      {podium.length > 1 && hidden > 0 ? (
        <Text style={[typography.caption, styles.more, { color: colors.onSurfaceVariant }]}>
          {hidden === 1 ? '+1 altro giocatore' : `+${hidden} altri giocatori`}
        </Text>
      ) : null}

      <Text style={[typography.kanji, styles.footer, { color: colors.onSurfaceVariant }]}>
        ごちそうさま · Sushi Streak
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    overflow: 'hidden',
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brand: {
    fontFamily: fonts.black,
    fontSize: 18,
  },
  session: {
    fontFamily: fonts.bold,
    fontSize: 22,
    letterSpacing: 0.5,
    marginTop: 16,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  winner: {
    marginTop: 10,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 14,
    marginBottom: 6,
  },
  podiumColumn: {
    flex: 1,
    alignItems: 'center',
  },
  podiumName: {
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  podiumBlock: {
    alignSelf: 'stretch',
    marginTop: 4,
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
    alignItems: 'center',
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  rowScore: {
    fontFamily: fonts.bold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  more: {
    marginTop: 2,
  },
  footer: {
    textAlign: 'center',
    marginTop: 14,
  },
});

export default ResultCard;

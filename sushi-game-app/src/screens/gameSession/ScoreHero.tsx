import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { plural } from '../../utils/plural';
import { fonts, typography, useAppTheme } from '../../theme/theme';
import RankBadge from '../../components/RankBadge';
import SectionTitle from '../../components/ui/SectionTitle';

interface ScoreHeroProps {
  score: number;
  // 0 finché il giocatore non compare nella classifica
  rank: number;
  playersCount: number;
}

// Punteggio personale in grande, con la posizione in classifica
const ScoreHero: React.FC<ScoreHeroProps> = ({ score, rank, playersCount }) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.hero}>
      <SectionTitle label="I tuoi pezzi" kanji="貫" centered style={styles.label} />
      {/* Con i caratteri di sistema molto grandi il numero cresce poco: resta leggibile sopra la pila */}
      <Text
        style={[styles.score, { color: colors.onBackground }]}
        accessibilityLabel={plural(score, 'pezzo', 'pezzi')}
        maxFontSizeMultiplier={1.15}
        testID="my-score"
      >
        {score}
      </Text>
      {rank > 0 ? (
        <View style={styles.rank}>
          <RankBadge rank={rank} size={26} />
          <Text style={[typography.bodyStrong, { color: colors.onSurfaceVariant }]} maxFontSizeMultiplier={1.4}>
            {`Sei ${rank}° su ${playersCount} · ${plural(score, 'pezzo', 'pezzi')}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  label: {
    marginBottom: 0,
  },
  score: {
    fontFamily: fonts.black,
    fontSize: 84,
    lineHeight: 92,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  rank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default ScoreHero;

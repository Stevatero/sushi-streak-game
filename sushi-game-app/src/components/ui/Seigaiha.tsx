import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/theme';

interface SeigaihaProps {
  style?: StyleProp<ViewStyle>;
  // Colore delle onde (di default quello del tema, molto tenue)
  color?: string;
  // Sfuma il motivo verso il basso nel colore indicato
  fadeTo?: string;
}

const FADE_STEPS = 8;

// Motivo tradizionale seigaiha (青海波, "onde del mare blu") come sfondo decorativo
const Seigaiha: React.FC<SeigaihaProps> = ({ style, color, fadeTo }) => {
  const theme = useAppTheme();
  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <Image
        source={require('../../../assets/patterns/seigaiha.png')}
        resizeMode="repeat"
        fadeDuration={0}
        // Dimensioni esplicite: altrimenti prevalgono quelle dell'asset (una sola piastrella)
        style={[styles.tile, { tintColor: color ?? theme.colors.pattern }]}
      />
      {fadeTo ? (
        <View style={styles.fade}>
          {Array.from({ length: FADE_STEPS }, (_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: fadeTo, opacity: (i + 1) / FADE_STEPS }} />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  tile: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
});

export default Seigaiha;

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { fonts, radii, typography, useAppTheme } from '../../theme/theme';
import AppButton from '../../components/ui/AppButton';
import Hanko from '../../components/ui/Hanko';
import Panel from '../../components/ui/Panel';

type ControlsState = 'playing' | 'finished' | 'ended';

interface GameControlsProps {
  state: ControlsState;
  bottomInset: number;
  // In partita
  canUndo: boolean;
  // Pulsante +1 attenuato quando i pezzi non si possono registrare (offline con un server senza coda)
  dimmed: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onFinish: () => void;
  // A fine partita
  endTitle: string;
  endMessage: string;
  // Chi ha chiuso la partita, se non l'hanno chiusa i giocatori finendo tutti
  endNote?: string;
  iWon: boolean;
  onShareResult: () => void;
  onRestaurant: () => void;
  onNewGame: () => void;
}

// Comandi in basso: +1, annulla e "Ho finito" durante la partita; attesa degli altri; esito finale
const GameControls: React.FC<GameControlsProps> = (props) => {
  const { colors } = useAppTheme();
  const { state, bottomInset } = props;

  // Pulsante "+1": piccolo rimbalzo e un'onda che si allarga
  const pressScale = useSharedValue(1);
  const ring = useSharedValue(0);
  const addButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.45 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 0.55 }],
  }));

  const pressAdd = () => {
    if (!props.dimmed) {
      pressScale.set(withSequence(withTiming(0.9, { duration: 70 }), withSpring(1, { damping: 9, stiffness: 320 })));
      ring.set(0);
      ring.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
    }
    props.onAdd();
  };

  const sideButtonStyle = [styles.sideButton, { backgroundColor: colors.glass, borderColor: colors.outline }];
  const captionStyle = [styles.caption, { color: colors.onSurface, backgroundColor: colors.glass }];

  return (
    <View style={[styles.controls, { paddingBottom: bottomInset + 18 }]}>
      {state === 'playing' ? (
        <View style={styles.row}>
          <View style={styles.sideControl}>
            <IconButton
              icon="undo-variant"
              accessibilityLabel="Annulla ultimo"
              testID="undo-piece"
              iconColor={colors.onSurface}
              size={24}
              onPress={props.onUndo}
              disabled={!props.canUndo}
              style={sideButtonStyle}
            />
            <Text style={captionStyle}>Annulla</Text>
          </View>

          <View style={styles.addWrapper}>
            <Animated.View pointerEvents="none" style={[styles.addRing, { borderColor: colors.primary }, ringStyle]} />
            <Animated.View style={addButtonStyle}>
              <Pressable
                onPress={pressAdd}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi pezzo"
                testID="add-piece"
                style={[
                  styles.addButton,
                  { backgroundColor: colors.primary, shadowColor: colors.primary, opacity: props.dimmed ? 0.55 : 1 },
                ]}
              >
                <Text style={[styles.addPlus, { color: colors.onPrimary }]} maxFontSizeMultiplier={1.15}>
                  +1
                </Text>
                <Text style={[styles.addKanji, { color: colors.onPrimary }]} maxFontSizeMultiplier={1.15}>
                  貫
                </Text>
              </Pressable>
            </Animated.View>
            <Text style={[captionStyle, styles.addCaption]}>Aggiungi pezzo</Text>
          </View>

          <View style={styles.sideControl}>
            <IconButton
              icon="flag-checkered"
              accessibilityLabel="Ho finito!"
              testID="finish-game"
              iconColor={colors.onSurface}
              size={24}
              onPress={props.onFinish}
              style={sideButtonStyle}
            />
            <Text style={captionStyle}>Ho finito</Text>
          </View>
        </View>
      ) : null}

      {state === 'finished' ? (
        <Panel tone="glass" style={styles.statusPanel}>
          <Hanko label="完" size={46} />
          <View style={styles.flex}>
            <Text style={[typography.subtitle, { color: colors.onSurface }]}>Hai finito! ごちそうさま</Text>
            <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>In attesa degli altri giocatori…</Text>
          </View>
        </Panel>
      ) : null}

      {state === 'ended' ? (
        <Panel tone="glass">
          <View style={styles.statusPanel}>
            <Hanko label="勝" size={50} color={props.iWon ? colors.gold : colors.primary} />
            <View style={styles.flex}>
              <Text style={[typography.title, { color: colors.onSurface }]}>{props.endTitle}</Text>
              <Text style={[typography.body, { color: colors.onSurfaceVariant }]}>{props.endMessage}</Text>
              {props.endNote ? (
                <Text style={[typography.caption, { color: colors.onSurfaceVariant }]}>{props.endNote}</Text>
              ) : null}
            </View>
          </View>
          <AppButton
            label="Condividi il risultato"
            icon="image-outline"
            variant="tonal"
            onPress={props.onShareResult}
            style={styles.shareButton}
            testID="panel-share-result"
          />
          <View style={styles.endButtons}>
            <AppButton
              label="Ristorante"
              icon="map-marker-outline"
              variant="outline"
              onPress={props.onRestaurant}
              style={styles.flex}
            />
            <AppButton label="Nuova partita" icon="plus" onPress={props.onNewGame} style={styles.flex} />
          </View>
        </Panel>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  controls: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sideControl: {
    alignItems: 'center',
    width: 76,
    marginBottom: 26,
  },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    margin: 0,
  },
  // Le didascalie hanno uno sfondo semitrasparente per restare leggibili sopra la pila
  caption: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  addWrapper: {
    alignItems: 'center',
  },
  addRing: {
    position: 'absolute',
    top: 0,
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
  },
  addButton: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  addPlus: {
    fontFamily: fonts.black,
    fontSize: 38,
    lineHeight: 42,
  },
  addKanji: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.85,
  },
  addCaption: {
    fontSize: 13,
    marginTop: 10,
  },
  statusPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  shareButton: {
    marginTop: 14,
  },
  endButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
});

export default GameControls;

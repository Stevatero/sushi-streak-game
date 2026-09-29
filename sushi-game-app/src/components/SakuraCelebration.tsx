import React, { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useAppTheme } from '../theme/theme';

/**
 * Festa per il vincitore: una pioggia di petali di ciliegio (sakura fubuki, 桜吹雪) con qualche
 * coriandolo nei colori dell'app. Ogni petalo usa una sola shared value (avanzamento 0 → 1),
 * da cui lo stile animato ricava caduta, oscillazione e rotazione sul thread UI.
 */

const PETALS = 38;

interface Petal {
  x: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  sway: number;
  swayTurns: number;
  phase: number;
  spin: number;
  round: boolean;
}

const PetalView: React.FC<{ petal: Petal; height: number }> = ({ petal, height }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      petal.delay,
      withTiming(1, { duration: petal.duration, easing: Easing.bezier(0.35, 0.1, 0.6, 1) })
    );
  }, [petal, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p === 0 ? 0 : p > 0.85 ? (1 - p) / 0.15 : 1,
      transform: [
        { translateX: petal.x + Math.sin(p * Math.PI * 2 * petal.swayTurns + petal.phase) * petal.sway },
        { translateY: -40 + p * (height + 80) },
        { rotate: `${p * petal.spin}deg` },
        { scaleX: 0.6 + 0.4 * Math.abs(Math.cos(p * Math.PI * 3 + petal.phase)) },
      ],
    };
  });

  const w = petal.size;
  const h = petal.round ? petal.size : petal.size * 0.7;
  return (
    <Animated.View
      style={[
        styles.petal,
        {
          width: w,
          height: h,
          backgroundColor: petal.color,
          borderTopLeftRadius: petal.round ? w / 2 : w,
          borderBottomRightRadius: petal.round ? w / 2 : w,
          borderTopRightRadius: petal.round ? w / 2 : 2,
          borderBottomLeftRadius: petal.round ? w / 2 : 2,
        },
        style,
      ]}
    />
  );
};

const SAKURA_COLORS = ['#F7C6D0', '#F4B3C2', '#FBDDE4', '#FFFFFF', '#F09AAE'];

function createPetals(width: number, confetti: string[]): Petal[] {
  return Array.from({ length: PETALS }, (_, i) => {
    const isConfetti = i % 5 === 0;
    const palette = isConfetti ? confetti : SAKURA_COLORS;
    return {
      x: Math.random() * width,
      size: isConfetti ? 7 + Math.random() * 4 : 12 + Math.random() * 10,
      color: palette[Math.floor(Math.random() * palette.length)],
      delay: Math.random() * 2200,
      duration: 3200 + Math.random() * 2200,
      sway: 18 + Math.random() * 36,
      swayTurns: 0.8 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 720,
      round: isConfetti && Math.random() < 0.5,
    };
  });
}

interface SakuraCelebrationProps {
  isVisible: boolean;
}

const SakuraCelebration: React.FC<SakuraCelebrationProps> = ({ isVisible }) => {
  const { width, height } = useWindowDimensions();
  const { colors } = useAppTheme();

  // Petali casuali generati una volta per ogni festeggiamento
  const petals = useMemo<Petal[]>(
    () => (isVisible ? createPetals(width, [colors.primary, colors.gold, colors.tertiary, colors.secondary]) : []),
    [isVisible, width, colors]
  );

  if (!isVisible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {petals.map((petal, index) => (
        <PetalView key={index} petal={petal} height={height} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
  petal: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export default SakuraCelebration;

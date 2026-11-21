import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { usePlaybackStatus } from '../player/hooks.ts';
import { useReduceMotion } from './motion.ts';
import { colors } from './theme.ts';

// Heights as a share of the tallest bar. Each bar steps at its own speed, so the three never move together.
const BARS = [
  { key: 'left', rest: 0.57, steps: [0.35, 1, 0.55, 0.85], stepMs: 260 },
  { key: 'middle', rest: 0.86, steps: [0.9, 0.4, 1, 0.6], stepMs: 320 },
  { key: 'right', rest: 0.43, steps: [0.6, 0.95, 0.3, 0.8], stepMs: 280 },
];

export function PlayingBars({ color = colors.accent }: { color?: string }) {
  const { playing } = usePlaybackStatus();
  const reduceMotion = useReduceMotion();
  const moving = playing && !reduceMotion;
  return (
    <View style={styles.bars}>
      {BARS.map(({ key, ...bar }) => (
        <Bar key={key} {...bar} moving={moving} color={color} />
      ))}
    </View>
  );
}

interface BarProps {
  rest: number;
  steps: number[];
  stepMs: number;
  moving: boolean;
  color: string;
}

function Bar({ rest, steps, stepMs, moving, color }: BarProps) {
  const height = useRef(new Animated.Value(rest)).current;

  useEffect(() => {
    const animation = moving
      ? Animated.loop(
          Animated.sequence(
            steps.map((toValue) => Animated.timing(height, { toValue, duration: stepMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true })),
          ),
        )
      : Animated.timing(height, { toValue: rest, duration: 150, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [moving, height, rest, steps, stepMs]);

  return <Animated.View style={[styles.bar, { backgroundColor: color, transform: [{ scaleY: height }] }]} />;
}

const styles = StyleSheet.create({
  bars: { width: 16, height: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1.5 },
  // Grows from the bottom, like the bars of a sound meter.
  bar: { width: 3, height: 14, borderRadius: 1, transformOrigin: 'bottom' },
});

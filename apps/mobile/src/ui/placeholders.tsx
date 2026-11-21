import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReduceMotion } from './motion.ts';
import { colors } from './theme.ts';

// Grey shapes with the size of the rows and cards they stand in for, so the screen does not jump when data arrives.

// Fades its children in and out together while something loads. Screen readers hear "Loading" once.
export function Pulse({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const fade = (toValue: number) => Animated.timing(opacity, { toValue, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const animation = Animated.loop(Animated.sequence([fade(0.45), fade(1)]));
    animation.start();
    return () => {
      animation.stop();
      opacity.setValue(1);
    };
  }, [reduceMotion, opacity]);

  return (
    <Animated.View accessible accessibilityLabel="Loading" style={{ opacity }}>
      {children}
    </Animated.View>
  );
}

export function Repeat({ times, children }: { times: number; children: ReactNode }) {
  return Array.from({ length: times }, (_, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the copies are identical and never move.
    <Fragment key={i}>{children}</Fragment>
  ));
}

// Pass `ranked` for chart rows, which have a number in front.
export function TrackRowPlaceholder({ ranked = false }: { ranked?: boolean }) {
  return (
    <View style={styles.row}>
      {ranked ? <Block width={18} height={14} /> : null}
      <Block width={48} height={48} radius={6} />
      <Lines first="70%" second="45%" />
    </View>
  );
}

export function TrackCardPlaceholder() {
  return (
    <View style={styles.card}>
      <Block width={136} height={136} radius={8} />
      <Block width={110} height={12} />
      <Block width={70} height={10} />
    </View>
  );
}

export function VideoRowPlaceholder() {
  return (
    <View style={styles.videoRow}>
      <Block width={96} height={54} radius={6} />
      <Lines first="85%" second="40%" />
    </View>
  );
}

function Lines({ first, second }: { first: `${number}%`; second: `${number}%` }) {
  return (
    <View style={styles.lines}>
      <Block width={first} height={12} />
      <Block width={second} height={10} />
    </View>
  );
}

function Block({ width, height, radius = 4 }: { width: number | `${number}%`; height: number; radius?: number }) {
  return <View style={{ width, height, borderRadius: radius, backgroundColor: colors.raised }} />;
}

// Same sizes and padding as the rows and cards in catalog.tsx.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60, paddingHorizontal: 20 },
  card: { width: 136, gap: 8 },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 72, paddingHorizontal: 20 },
  lines: { flex: 1, gap: 8 },
});

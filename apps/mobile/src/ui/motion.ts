import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Follows Android's "Remove animations" setting. Looping animations stand still while it is on.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => subscription.remove();
  }, []);
  return reduce;
}

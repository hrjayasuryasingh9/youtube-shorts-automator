import { useEffect, useRef, useState } from 'react';

export function useCountUp(
  target: number,
  duration: number = 800
): number {
  const [value, setValue] = useState(target);
  const startValueRef = useRef(target);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === startValueRef.current) return;

    const startValue = startValueRef.current;
    const difference = target - startValue;

    startTimeRef.current = null;

    const animate = (time: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = time;
      }

      const elapsed = time - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      const easedProgress = easeOutCubic(progress);

      const nextValue = Math.round(startValue + difference * easedProgress);
      setValue(nextValue);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        startValueRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [target, duration]);

  return value;
}

// Smooth easing
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
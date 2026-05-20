"use client";

import { useEffect, useRef, useState } from "react";

export interface UseWindowFocusedOptions {
  initial?: boolean;
}

export function useWindowFocused({ initial }: UseWindowFocusedOptions = {}): boolean {
  const [focused, setFocused] = useState<boolean>(() => {
    if (typeof window === "undefined") return initial ?? true;
    return document.visibilityState === "visible" && document.hasFocus();
  });

  useEffect(() => {
    const recompute = () => {
      setFocused(document.visibilityState === "visible" && document.hasFocus());
    };
    window.addEventListener("focus", recompute);
    window.addEventListener("blur", recompute);
    document.addEventListener("visibilitychange", recompute);
    return () => {
      window.removeEventListener("focus", recompute);
      window.removeEventListener("blur", recompute);
      document.removeEventListener("visibilitychange", recompute);
    };
  }, []);

  return focused;
}

export function useWindowFocusedRef(): React.MutableRefObject<boolean> {
  const ref = useRef<boolean>(true);
  useEffect(() => {
    const recompute = () => {
      ref.current = document.visibilityState === "visible" && document.hasFocus();
    };
    recompute();
    window.addEventListener("focus", recompute);
    window.addEventListener("blur", recompute);
    document.addEventListener("visibilitychange", recompute);
    return () => {
      window.removeEventListener("focus", recompute);
      window.removeEventListener("blur", recompute);
      document.removeEventListener("visibilitychange", recompute);
    };
  }, []);
  return ref;
}

export function useThrottledIntervalMs(activeMs: number, blurredMs: number): number {
  const focused = useWindowFocused();
  return focused ? activeMs : blurredMs;
}

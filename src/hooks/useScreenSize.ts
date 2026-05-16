import { useEffect, useMemo, useState } from "react";

const BREAKPOINTS = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
} as const;

function getScreenWidth() {
  if (typeof window === "undefined") return BREAKPOINTS.lg;
  return window.innerWidth;
}

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 120) {
  let timeout: number | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

export function useScreenSize() {
  const [width, setWidth] = useState(getScreenWidth);

  useEffect(() => {
    const onResize = debounce(() => {
      setWidth(getScreenWidth());
    }, 120);

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return useMemo(() => {
    const isMobile = width < BREAKPOINTS.md;
    const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
    const isDesktop = width >= BREAKPOINTS.lg;

    return {
      width,
      breakpoints: BREAKPOINTS,
      isMobile,
      isTablet,
      isDesktop,
      isTv: width >= BREAKPOINTS.xxl,
    } as const;
  }, [width]);
}

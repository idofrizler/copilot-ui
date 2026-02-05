import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Breakpoint definitions for responsive design
 * - mobile: < 640px
 * - tablet: 640px - 1023px
 * - desktop: >= 1024px
 */
export const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
} as const;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveState {
  /** Current breakpoint category */
  breakpoint: Breakpoint;
  /** Viewport width in pixels */
  width: number;
  /** Viewport height in pixels */
  height: number;
  /** True if viewport is mobile-sized (< 640px) */
  isMobile: boolean;
  /** True if viewport is tablet-sized (640px - 1023px) */
  isTablet: boolean;
  /** True if viewport is desktop-sized (>= 1024px) */
  isDesktop: boolean;
  /** True if viewport is smaller than desktop (< 1024px) */
  isMobileOrTablet: boolean;
}

/**
 * Get the current breakpoint based on width
 */
function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

/**
 * Hook that provides responsive viewport information
 * Updates on window resize with optional debouncing for performance
 *
 * @param debounceMs - Debounce delay in milliseconds (default: 100)
 * @returns ResponsiveState object with breakpoint and dimension info
 *
 * @example
 * ```tsx
 * const { isMobile, isDesktop, breakpoint } = useResponsive()
 *
 * return (
 *   <div className={isMobile ? 'flex-col' : 'flex-row'}>
 *     {isDesktop && <Sidebar />}
 *   </div>
 * )
 * ```
 */
export function useResponsive(debounceMs: number = 100): ResponsiveState {
  const [dimensions, setDimensions] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  const handleResize = useCallback(() => {
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debouncedResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, debounceMs);
    };

    window.addEventListener('resize', debouncedResize);

    // Initial call to set correct dimensions
    handleResize();

    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [handleResize, debounceMs]);

  return useMemo(() => {
    const breakpoint = getBreakpoint(dimensions.width);
    return {
      breakpoint,
      width: dimensions.width,
      height: dimensions.height,
      isMobile: breakpoint === 'mobile',
      isTablet: breakpoint === 'tablet',
      isDesktop: breakpoint === 'desktop',
      isMobileOrTablet: breakpoint !== 'desktop',
    };
  }, [dimensions.width, dimensions.height]);
}

export default useResponsive;

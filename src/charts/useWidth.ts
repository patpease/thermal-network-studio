import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * The rendered width of an element, kept current, and whether it is below the
 * width a chart's desktop drawing needs.
 *
 * Each chart passes its own `below`: the width at which its desktop drawing
 * stops fitting and starts scrolling sideways — 460 for the bar charts, whose
 * SVG carried `min-width: 460px`, and 640 for the Sankey. Below it the chart
 * draws a phone layout at the width it is shown, so one drawing unit is one
 * CSS pixel and the type is the size the stylesheet says. Above it nothing has
 * changed, which is what keeps the desktop identical.
 *
 * **Zero means unknown, and unknown means desktop.** jsdom lays nothing out and
 * reports every box as 0 wide; a test that mounted a chart would otherwise get
 * a layout it never asked for. The first real measurement happens in a layout
 * effect, before paint, so a phone never sees the desktop frame either.
 *
 * Lifted from ZEEL, where the PNG export relies on the same rule (phase 07
 * here).
 */
export function useWidth(
  ref: RefObject<Element | null>,
  below: number,
): { width: number; compact: boolean } {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return { width, compact: width > 0 && width < below };
}

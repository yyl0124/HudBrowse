export type ShapePoint = { x: number; y: number };

/** One sampled vector outline drives both SVG paint and the native hit region. */
export function shellShape(width: number, height: number, compact: boolean) {
  const margin = width <= 540 && !compact ? 10 : 14;
  const top = margin;
  const bodyTop = width <= 540 ? 74 : 82;
  const titleWidth = compact ? Math.min(440, width - 28) : Math.min(760, width - margin * 2);
  const left = (width - titleWidth) / 2, right = left + titleWidth;
  const points: ShapePoint[] = [];
  const line = (x: number, y: number) => points.push({ x, y });
  const curve = (cx: number, cy: number, x: number, y: number) => {
    const start = points[points.length - 1];
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, s = 1 - t;
      line(s * s * start.x + 2 * s * t * cx + t * t * x, s * s * start.y + 2 * s * t * cy + t * t * y);
    }
  };
  if (compact) {
    const bottom = Math.min(height - 14, 86), radius = Math.min(36, (bottom - top) / 2);
    line(left + radius, top); line(right - radius, top); curve(right, top, right, top + radius);
    line(right, bottom - radius); curve(right, bottom, right - radius, bottom);
    line(left + radius, bottom); curve(left, bottom, left, bottom - radius);
    line(left, top + radius); curve(left, top, left + radius, top);
  } else {
    const radius = 28, bottom = height - margin, outerRight = width - margin;
    const join = Math.min(20, (left - margin) / 2);
    const bodyRadius = Math.min(24, Math.max(0, left - margin - join));
    line(left + radius, top); line(right - radius, top); curve(right, top, right, top + radius);
    line(right, bodyTop - join); curve(right, bodyTop, right + join, bodyTop);
    line(outerRight - bodyRadius, bodyTop); curve(outerRight, bodyTop, outerRight, bodyTop + bodyRadius);
    line(outerRight, bottom - 24); curve(outerRight, bottom, outerRight - 24, bottom);
    line(margin + 24, bottom); curve(margin, bottom, margin, bottom - 24);
    line(margin, bodyTop + bodyRadius); curve(margin, bodyTop, margin + bodyRadius, bodyTop);
    line(left - join, bodyTop); curve(left, bodyTop, left, bodyTop - join);
    line(left, top + radius); curve(left, top, left + radius, top);
  }
  return { points, titleWidth, left, top, bodyTop, margin, path: `M${points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' L')} Z` };
}

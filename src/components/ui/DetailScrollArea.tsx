import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep the hint outside the scroller so its visibility never changes scroll geometry. */
export function DetailScrollArea({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  useLayoutEffect(() => {
    const area = viewport.current!;
    const measure = () => setHasMore(area.scrollHeight - area.clientHeight - area.scrollTop > 2);
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(content.current!);
    area.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => { observer.disconnect(); area.removeEventListener('scroll', measure); };
  }, []);
  return <div className="inspector-scroll-shell">
    <div ref={viewport} className="inspector-scroll" tabIndex={0} aria-label="目标详情内容">
      <div ref={content} className="inspector-scroll-content">{children}</div>
    </div>
    <button className="inspector-scroll-hint" aria-label="向下查看更多详情" hidden={!hasMore}
      onClick={() => viewport.current?.scrollBy({ top: Math.max(80, viewport.current.clientHeight * .7),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
      <ChevronDown size={17} />
    </button>
  </div>;
}

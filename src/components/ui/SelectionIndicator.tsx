import { useLayoutEffect, useRef, useState } from 'react';

/** The highlight moves independently of button text and keeps its size on resize. */
export function SelectionIndicator({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; width: number }>();
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const selected = parent.querySelector<HTMLElement>('button.is-selected');
      if (selected) setBox({ x: selected.offsetLeft, width: selected.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    parent.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [value]);
  return <span ref={ref} aria-hidden="true" className={`selection-indicator ${box ? 'is-ready' : ''}`} style={{ width: box?.width ?? 0, transform: `translateX(${box?.x ?? 0}px)` }} />;
}

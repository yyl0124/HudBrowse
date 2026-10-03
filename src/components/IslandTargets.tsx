import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, CircleDot } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { TargetIcon } from './TargetIcon';

type Gesture = { pointerId: number; source?: string; target?: string; startX: number; startY: number; x: number; y: number; scroll: number; moved: boolean };

export function IslandTargets({ disabled, onToggle }: { disabled: boolean; onToggle: (id: string) => void }) {
  const configs = useAppStore(state => state.urlConfigs);
  const runtime = useAppStore(state => state.runtime);
  const reorder = useAppStore(state => state.reorderTargets);
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>();
  const frame = useRef<number>();
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ source?: string; target?: string }>({});
  const [edges, setEdges] = useState({ left: false, right: false });

  const finish = (commit = false) => {
    const current = gesture.current;
    gesture.current = undefined;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    const element = viewport.current;
    if (current && element?.hasPointerCapture(current.pointerId)) element.releasePointerCapture(current.pointerId);
    if (commit && current?.moved && current.source && current.target) reorder(current.source, current.target);
    setDrag({});
  };

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => setEdges({ left: element.scrollLeft > 1, right: element.scrollLeft < element.scrollWidth - element.clientWidth - 1 });
    const wheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth) return;
      // A non-passive listener owns both wheel axes; no duplicate native scroll or page scroll.
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
      element.scrollLeft += delta * unit;
    };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); element.removeEventListener('scroll', update); };
  }, [configs.length]);

  useEffect(() => {
    const cancel = () => finish();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); finish(); } };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      const current = gesture.current;
      gesture.current = undefined;
      if (current && viewport.current?.hasPointerCapture(current.pointerId)) viewport.current.releasePointerCapture(current.pointerId);
    };
  }, []);
  useEffect(() => { if (disabled) finish(); }, [disabled]);

  const updateTarget = () => {
    const current = gesture.current;
    const element = viewport.current;
    if (!current?.source || !element) return;
    const bounds = element.getBoundingClientRect();
    const inside = current.x >= bounds.left && current.x <= bounds.right && current.y >= bounds.top && current.y <= bounds.bottom;
    let target: string | undefined;
    if (inside) {
      let distance = Infinity;
      for (const button of element.querySelectorAll<HTMLButtonElement>('[data-target-id]')) {
        const rect = button.getBoundingClientRect();
        const next = Math.abs(current.x - (rect.left + rect.width / 2));
        if (next < distance) { target = button.dataset.targetId; distance = next; }
      }
    }
    if (current.target !== target) { current.target = target; setDrag({ source: current.source, target }); }
  };
  const autoScroll = () => {
    const current = gesture.current;
    const element = viewport.current;
    if (!current?.moved || !current.source || !element) return;
    const rect = element.getBoundingClientRect();
    if (current.y >= rect.top - 12 && current.y <= rect.bottom + 12) {
      if (current.x < rect.left + 12) element.scrollLeft -= 3;
      else if (current.x > rect.right - 12) element.scrollLeft += 3;
    }
    updateTarget();
    frame.current = requestAnimationFrame(autoScroll);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.moved && Math.hypot(current.x - current.startX, current.y - current.startY) < 5) return;
    event.preventDefault();
    if (!current.moved) {
      current.moved = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ source: current.source });
      if (current.source) frame.current = requestAnimationFrame(autoScroll);
    }
    if (current.source) updateTarget();
    else event.currentTarget.scrollLeft = current.scroll + current.startX - current.x;
  };
  const browse = (direction: number) => viewport.current?.scrollBy({ left: direction * 160, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });

  return <div className="compact-targets" data-island-targets title="滚轮或左右按钮浏览，拖拽图标排序">
    <button className="compact-scroll-button" aria-label="向左浏览目标" title="向左浏览" disabled={disabled || !edges.left} onClick={() => browse(-1)}><ChevronLeft size={12} /></button>
    <div ref={viewport} className="compact-target-scroll" role="group" aria-label="灵动岛目标，左右滚动浏览，拖拽排序"
      onDragStart={event => event.preventDefault()}
      onPointerDown={event => {
        if (disabled || event.button !== 0 || event.pointerType === 'touch' || !event.isPrimary) return;
        suppressClick.current = false;
        gesture.current = { pointerId: event.pointerId, source: (event.target as HTMLElement).closest<HTMLElement>('[data-target-id]')?.dataset.targetId,
          startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, scroll: event.currentTarget.scrollLeft, moved: false };
      }}
      onPointerMove={move}
      onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) { updateTarget(); finish(true); } }}
      onPointerCancel={() => finish()}
      onLostPointerCapture={() => { if (gesture.current) finish(); }}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      {configs.map((config, index) => <button key={config.id}
        className={`compact-target ${drag.source === config.id ? 'is-dragging' : ''} ${drag.target === config.id && drag.source !== config.id ? 'is-drop-target' : ''}`}
        data-target-id={config.id} draggable={false} disabled={disabled} aria-pressed={!!runtime[config.id]?.visible}
        aria-label={`${config.type === 'scene' ? '执行场景' : runtime[config.id]?.visible ? '隐藏' : '显示'} ${config.name}`}
        title={`${config.name} · ${runtime[config.id]?.visible ? '显示中' : '已隐藏'} · 拖拽或 Alt+左右键排序`}
        onKeyDown={event => {
          if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            const neighbor = configs[index + (event.key === 'ArrowLeft' ? -1 : 1)];
            if (neighbor) reorder(config.id, neighbor.id);
          }
        }} onClick={() => onToggle(config.id)}>
        <TargetIcon config={config} active={!!runtime[config.id]?.visible} small />
      </button>)}
      {!configs.length && <span className="compact-idle"><CircleDot size={18} /></span>}
    </div>
    <button className="compact-scroll-button" aria-label="向右浏览目标" title="向右浏览" disabled={disabled || !edges.right} onClick={() => browse(1)}><ChevronRight size={12} /></button>
  </div>;
}

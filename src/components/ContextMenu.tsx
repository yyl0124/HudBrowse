import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, RefreshCw, Trash2, Cookie } from 'lucide-react';
import { backend } from '@/services/backend';
import { reportError } from '@/services/targets';
import { useAppStore } from '@/store/appStore';

export function ContextMenu({ windowId, x, y, onClose }: { windowId: string; x: number; y: number; onClose: () => void; }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState({ x, y });
  const exists = useAppStore(state => !!state.runtime[windowId]?.exists);
  useLayoutEffect(() => {
    const rect = ref.current!.getBoundingClientRect();
    setPosition({ x: Math.max(24, Math.min(x, window.innerWidth - rect.width - 24)), y: Math.max(96, Math.min(y, window.innerHeight - rect.height - 24)) });
  }, [x, y]);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) closeRef.current(); };
    const resize = () => closeRef.current();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('resize', resize); };
  }, []);
  const action = (name: Parameters<typeof backend.pageAction>[1]) => {
    onClose();
    if (name.startsWith('clear') && !window.confirm(name === 'clear_cookies' ? '清除该网址全部 Cookie？' : '清除该网址缓存和站点存储？')) return;
    void backend.pageAction(windowId, name).catch(reportError);
  };
  return createPortal(<div ref={ref} role="menu" aria-label="目标操作" className="context-menu" style={{ left: position.x, top: position.y }} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <><div className="menu-divider" /><button role="menuitem" className="menu-item" disabled={!exists} onClick={() => action('refresh')}><RefreshCw size={15} />刷新</button><div className="menu-navigation"><button role="menuitem" className="menu-item" disabled={!exists} onClick={() => action('back')}><ArrowLeft size={15} />后退</button><button role="menuitem" className="menu-item" disabled={!exists} onClick={() => action('forward')}><ArrowRight size={15} />前进</button></div><button role="menuitem" className="menu-item" disabled={!exists} onClick={() => action('clear_cache')}><Trash2 size={15} />清除缓存与站点存储</button><button role="menuitem" className="menu-item" disabled={!exists} onClick={() => action('clear_cookies')}><Cookie size={15} />清除 Cookie</button></>
</div>, document.body);
}

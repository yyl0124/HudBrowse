import { PropsWithChildren, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export function Modal({ title, onClose, children, busy = false }: PropsWithChildren<{ title: string; onClose: () => void; busy?: boolean }>) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])].filter(element => !element.closest('fieldset:disabled'));
    (focusable().find(element => element.tagName === 'INPUT') ?? focusable()[0])?.focus();
    return () => {
      const active = document.activeElement;
      // A closing capture dialog must not steal focus from the new edit dialog.
      if (!active || active === document.body || panel?.contains(active)) previous?.focus();
    };
  }, []);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => { gsap.fromTo(ref.current, { y: 18, scale: 0.985, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out', clearProps: 'all' }); });
    return () => media.revert();
  }, { scope: ref });
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="modal-panel" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])].filter(element => !element.closest('fieldset:disabled'));
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); ref.current?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}><div className="modal-header"><div><h2 id={titleId}>{title}</h2></div><button type="button" className="icon-button" title="关闭" aria-label="关闭" onClick={onClose} disabled={busy}><X size={18} /></button></div><div className="modal-content">{children}</div></div>
  </div>;
}

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Presence } from './Presence';
import { Check, ChevronDown } from 'lucide-react';

export function Select({ label, value, options, onChange, className = '' }: {
  label: string; value: string; options: readonly { value: string; label: string }[];
  onChange: (value: string) => void; className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; height: number }>();
  const [active, setActive] = useState(0);
  const open = () => {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.max(150, rect.width);
    const height = Math.min(options.length * 36 + 12, 260, innerHeight - 110);
    const below = innerHeight - 24 - rect.bottom;
    setActive(Math.max(0, options.findIndex(option => option.value === value)));
    setPosition({ left: Math.max(24, Math.min(rect.left, innerWidth - width - 24)), top: below >= height ? rect.bottom + 5 : Math.max(90, rect.top - height - 5), width, height });
  };
  const choose = (index: number) => { onChange(options[index].value); setPosition(undefined); trigger.current?.focus(); };
  useEffect(() => {
    if (!position) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setPosition(undefined);
    };
    const close = (event: Event) => { if (!popup.current?.contains(event.target as Node)) setPosition(undefined); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); document.removeEventListener('scroll', close, true); };
  }, [position]);
  useEffect(() => { if (position) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, position, id]);
  return <>
    <button ref={trigger} type="button" className={`custom-select ${className}`} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={!!position} aria-controls={position ? id : undefined} aria-activedescendant={position ? `${id}-${active}` : undefined}
      onClick={() => position ? setPosition(undefined) : open()} onBlur={() => setPosition(undefined)}
      onKeyDown={event => {
        if (event.key === 'Escape' && position) { event.preventDefault(); event.stopPropagation(); setPosition(undefined); return; }
        if (event.key === 'Tab') { setPosition(undefined); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (!position) { open(); return; }
          if (event.key === 'Enter' || event.key === ' ') choose(active);
          else setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
        } else if (event.key.length === 1 && position) {
          const index = options.findIndex(option => option.label.toLowerCase().startsWith(event.key.toLowerCase()));
          if (index >= 0) setActive(index);
        }
      }}><span>{options.find(option => option.value === value)?.label}</span><ChevronDown size={13} /></button>
    {createPortal(<Presence>{!!position && <div ref={popup} id={id} role="listbox" aria-label={label} className="select-popup" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height }} onMouseDown={event => event.preventDefault()}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value} className={`select-option ${active === index ? 'is-focused' : ''}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <Check size={14} />}</div>)}
    </div>}</Presence>, document.body)}
  </>;
}

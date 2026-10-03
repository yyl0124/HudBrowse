import { ReactElement, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

/** Retain a closing overlay briefly for its exit, but disable its focus and events. */
export function Presence({ children }: { children: ReactElement | null | false }) {
  const [retained, setRetained] = useState(children);
  const ref = useRef<HTMLDivElement>(null);
  if (children && children !== retained) setRetained(children);
  const open = !!children;
  useGSAP(() => {
    const root = ref.current;
    if (!root) return;
    root.inert = !open;
    if (open || !retained) return;
    const media = gsap.matchMedia();
    media.add({ reduced: '(prefers-reduced-motion: reduce)', normal: '(prefers-reduced-motion: no-preference)' }, context => {
      gsap.to(root.firstElementChild, { opacity: 0, duration: context.conditions?.reduced ? 0 : 0.14, ease: 'power1.out', onComplete: () => setRetained(null) });
    });
    return () => media.revert();
  }, { scope: ref, dependencies: [open], revertOnUpdate: true });
  return retained ? <div ref={ref} className="motion-presence" aria-hidden={!open || undefined}>{children || retained}</div> : null;
}

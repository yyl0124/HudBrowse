import { RefObject } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Animate semantic changes, never background polling or each keystroke's rerender. */
export function useContentMotion(ref: RefObject<HTMLElement>, change: string, selector?: string) {
  useGSAP(() => {
    const root = ref.current;
    if (!root || !root.getClientRects().length) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const bounds = root.getBoundingClientRect();
      const nodes = selector ? [...root.querySelectorAll<HTMLElement>(selector)].filter(node => {
        const box = node.getBoundingClientRect();
        return box.bottom >= bounds.top && box.top <= bounds.bottom;
      }).slice(0, 20) : [root];
      if (nodes.length) gsap.fromTo(nodes, { opacity: 0, y: 7 }, {
        opacity: 1, y: 0, duration: 0.24, stagger: { amount: 0.08 },
        ease: 'power2.out', clearProps: 'opacity,transform', overwrite: 'auto',
      });
    });
    return () => media.revert();
  }, { scope: ref, dependencies: [change], revertOnUpdate: true });
}

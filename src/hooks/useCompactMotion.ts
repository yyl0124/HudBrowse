import { RefObject, useRef } from 'react';
import { flushSync } from 'react-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { shell } from '@/services/shell';

gsap.registerPlugin(useGSAP);

/** Keep native resizing between the exit and entrance, while the shell is transparent. */
export function useCompactMotion(root: RefObject<HTMLDivElement>, setCompact: (value: boolean) => void) {
  const switching = useRef(false);
  const mounted = useRef(false);
  const { contextSafe } = useGSAP(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, { scope: root });
  const tween = contextSafe((element: HTMLElement, vars: gsap.TweenVars) => new Promise<void>(resolve => {
    gsap.to(element, { ...vars, overwrite: 'auto', onComplete: resolve, onInterrupt: resolve });
  }));
  const enter = contextSafe((element: HTMLElement, compact: boolean, reduce: boolean) => {
    gsap.set(element, { opacity: reduce ? 1 : 0, scaleX: compact ? .92 : .96,
      scaleY: compact ? .86 : .82, transformOrigin: '50% 14px' });
    return tween(element, { opacity: 1, scaleX: 1, scaleY: 1, duration: reduce ? 0 : .24,
      ease: 'power3.out', clearProps: 'opacity,transform,transformOrigin' });
  });
  return async (compact: boolean) => {
    const element = root.current;
    if (!element || switching.current) return;
    switching.current = true;
    element.inert = true;
    element.setAttribute('aria-busy', 'true');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      if (!reduce) await tween(element, { opacity: 0, scaleX: compact ? .65 : .96,
        scaleY: compact ? .18 : .85, transformOrigin: '50% 14px', duration: .18, ease: 'power2.in' });
      if (!mounted.current) return;
      await shell.compact(compact);
      if (!mounted.current) return;
      flushSync(() => setCompact(compact));
      await enter(element, compact, reduce);
    } catch (error) {
      // A failed native command must leave the previous UI visible and usable.
      if (mounted.current) await enter(element, !compact, reduce);
      throw error;
    } finally {
      switching.current = false;
      element.inert = false;
      element.removeAttribute('aria-busy');
    }
  };
}

import { useLayoutEffect, useState } from 'react';
import { shellShape } from '@/utils/shellShape';
import { shell } from '@/services/shell';
import { reportError } from '@/services/targets';

export function ShellOutline({ compact }: { compact: boolean }) {
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight, scale: devicePixelRatio });
  useLayoutEffect(() => {
    const resize = () => setSize({ width: innerWidth, height: innerHeight, scale: devicePixelRatio });
    const observer = new ResizeObserver(resize);
    observer.observe(document.documentElement);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  const shape = shellShape(size.width, size.height, compact);
  useLayoutEffect(() => {
    // Do not submit a polygon while the native window is between minimized
    // and restored layout states. The native side also ignores zero-sized
    // frames, but this avoids reporting a stale outline from this frame.
    const ready = size.width >= 120 && size.height >= (compact ? 80 : 110);
    if (ready) void shell.shape(shape.points, size.width, size.height).catch(reportError);
  }, [size.width, size.height, size.scale, compact]);
  return <svg className="shell-outline" width={size.width} height={size.height} aria-hidden="true"><path d={shape.path} /></svg>;
}

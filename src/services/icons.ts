import { invoke } from '@tauri-apps/api/tauri';
import { WindowInfo } from '@/types/url-config';
import { isDesktop } from './shell';

const cache = new Map<string, Promise<string | undefined>>();
export function siteIcon(url: string): Promise<string | undefined> {
  if (!isDesktop()) return Promise.resolve(undefined);
  if (!cache.has(url)) {
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(url, invoke<string | null>('get_site_icon', { url }).then(value => value ?? undefined).catch(() => undefined));
  }
  return cache.get(url)!;
}
export function windowIcon(info: WindowInfo): Promise<string | undefined> {
  if (info.icon?.startsWith('data:image/')) return Promise.resolve(info.icon);
  if (!isDesktop()) return Promise.resolve(undefined);
  const key = `${info.exePath}:${info.hwnd}:${info.processId}:${info.className}`;
  if (!cache.has(key)) {
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(key, invoke<string | null>('get_window_icon', { info }).then(value => value ?? undefined).catch(() => { cache.delete(key); return undefined; }));
  }
  return cache.get(key)!;
}

import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';

export function isDesktop() { return typeof window !== 'undefined' && '__TAURI_IPC__' in window; }
export const shell = {
  async getCompact(): Promise<boolean> { return isDesktop() ? !!(await invoke('get_main_compact')) : false; },
  async compact(value: boolean) {
    if (isDesktop()) await invoke('set_main_compact', { compact: value });
  },
  async minimize() { if (isDesktop()) await appWindow.minimize(); },
  async maximize() { if (isDesktop()) await appWindow.toggleMaximize(); },
  async close() { if (isDesktop()) await invoke('request_main_close'); },
  async drag() { if (isDesktop()) await appWindow.startDragging(); },
  async resize() { if (isDesktop()) await invoke('resize_main_window'); },
  async shape(points: { x: number; y: number }[], width: number, height: number) { if (isDesktop()) await invoke('set_main_shape', { points, width, height }); },
};

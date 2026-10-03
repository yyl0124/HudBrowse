import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GLOBAL_CONFIG } from '@/types/settings';
import { TargetState, UrlConfig } from '@/types/url-config';

const native = vi.hoisted(() => ({
  syncTargets: vi.fn(async (_configs: UrlConfig[]) => {}), apply: vi.fn(async (_config: UrlConfig) => ({})),
  show: vi.fn(async (_config: UrlConfig) => ({})), states: vi.fn(async () => []), saveSession: vi.fn(async () => {}),
  loadSession: vi.fn(async (): Promise<TargetState[]> => []), tray: vi.fn(async (_visible: boolean) => {}), getAutoStart: vi.fn(async () => false),
  closeToTray: vi.fn(async (_enabled: boolean) => {}),
}));
const shortcuts = vi.hoisted(() => ({ register: vi.fn(async () => {}), unregister: vi.fn(async () => {}), isRegistered: vi.fn(async () => false) }));
vi.mock('./backend', () => ({ backend: native }));
vi.mock('@tauri-apps/api/globalShortcut', () => shortcuts);
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  native.loadSession.mockResolvedValue([]);
});
const config = (id: string): UrlConfig => ({ id, type: 'url', name: id, url: 'https://example.com/', hotkey: '', createdAt: 1, updatedAt: 1 });
const state = (id: string, visible: boolean, minimized = false): TargetState => ({ id, exists: true, visible, minimized, position: { x: -800, y: 20 }, size: { width: 800, height: 600 } });

describe('startup session semantics', () => {
  it.each(['native', 'legacy'])('never wakes captured programs from %s startup restoration', async source => {
    const { useAppStore } = await import('@/store/appStore');
    const { initializeApp } = await import('./targets');
    const desktop: UrlConfig = { ...config('desktop'), type: 'window', url: '' };
    useAppStore.setState({ urlConfigs: [desktop, config('web')] });
    if (source === 'native') native.loadSession.mockResolvedValue([state('desktop', true), state('web', true)]);
    else vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'hudbrowse_last_session' ? JSON.stringify({ openWindows: ['desktop', 'web'] }) : null, setItem: vi.fn(), removeItem: vi.fn() });
    await initializeApp();
    expect(native.show.mock.calls.map(([item]) => item.id)).toEqual(['web']);
    expect(native.apply.mock.calls.map(([item]) => item.id)).toEqual(['desktop']);
  });
  it('registers scene shortcuts while restoring and syncing only real targets', async () => {
    const { useAppStore } = await import('@/store/appStore');
    const { initializeApp } = await import('./targets');
    const member = config('member');
    const scene: UrlConfig = { ...config('scene'), type: 'scene', url: '', memberIds: [member.id], hotkey: 'Alt+J' };
    useAppStore.setState({ urlConfigs: [scene, member] });
    native.loadSession.mockResolvedValue([state('member', true), state('scene', true)]);
    await initializeApp();
    expect(shortcuts.register).toHaveBeenCalledWith('Alt+J', expect.any(Function));
    expect(native.syncTargets.mock.calls[0][0].map(item => item.id)).toEqual(['member']);
    expect(native.show.mock.calls.map(([item]) => item.id)).toEqual(['member']);
    expect(native.apply).not.toHaveBeenCalled();
  });
  it('restores only visible, non-minimized targets and their physical geometry', async () => {
    const { useAppStore } = await import('@/store/appStore');
    const { initializeApp } = await import('./targets');
    useAppStore.setState({ urlConfigs: ['visible', 'hidden', 'minimized'].map(config) });
    native.loadSession.mockResolvedValue([state('visible', true), state('hidden', false), state('minimized', true, true)]);
    await initializeApp();
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.show.mock.calls[0][0].id).toBe('visible');
    expect(native.show.mock.calls[0][0].lastPosition).toEqual({ x: -800, y: 20 });
    expect(native.loadSession.mock.invocationCallOrder[0]).toBeLessThan(native.saveSession.mock.invocationCallOrder[0]);
  });
  it('does not restore when the global session option is disabled', async () => {
    const { useAppStore } = await import('@/store/appStore');
    const { initializeApp } = await import('./targets');
    useAppStore.setState({ urlConfigs: [config('visible')], config: { ...DEFAULT_GLOBAL_CONFIG, restoreLastSession: false } });
    native.loadSession.mockResolvedValue([state('visible', true)]);
    await initializeApp();
    expect(native.show).not.toHaveBeenCalled();
  });
  it('runs initialization once for concurrent StrictMode callers', async () => {
    const { initializeApp } = await import('./targets');
    await Promise.all([initializeApp(), initializeApp()]);
    expect(native.loadSession).toHaveBeenCalledOnce();
  });
});

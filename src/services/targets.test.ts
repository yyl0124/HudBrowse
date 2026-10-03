import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GLOBAL_CONFIG } from '@/types/settings';
import { TargetState, UrlConfig } from '@/types/url-config';
import { effectiveSettings } from '@/utils/storage';

const native = vi.hoisted(() => ({
  syncTargets: vi.fn(async (_configs: UrlConfig[]) => {}), apply: vi.fn(async (_config: UrlConfig) => ({})),
  remove: vi.fn(async (_id: string) => {}), toggle: vi.fn(async (_config: UrlConfig) => ({ visible: true })),
  show: vi.fn(async (_config: UrlConfig) => ({ visible: true })), hide: vi.fn(async (_id: string) => ({ visible: false })), states: vi.fn(async (): Promise<TargetState[]> => []), saveSession: vi.fn(async () => {}),
}));
const shortcuts = vi.hoisted(() => ({ register: vi.fn(async () => {}), unregister: vi.fn(async () => {}) }));
vi.mock('./backend', () => ({ backend: native }));
vi.mock('@tauri-apps/api/globalShortcut', () => shortcuts);
vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
const { useAppStore } = await import('@/store/appStore');
const { saveTarget, toggleTarget, deleteTarget, checkConflict } = await import('./targets');
let id = 0;
const target = (overrides: Partial<UrlConfig> = {}): UrlConfig => ({ id: `test_${++id}`, type: 'url', name: 'Example', url: 'https://example.com/', hotkey: '', createdAt: 1, updatedAt: 1, ...overrides });
beforeEach(() => {
  vi.clearAllMocks();
  native.states.mockResolvedValue([]);
  useAppStore.setState({ urlConfigs: [], runtime: {}, config: structuredClone(DEFAULT_GLOBAL_CONFIG), initialized: true });
});
describe('shared target actions', () => {
  it('preserves independent settings and geometry when editing a target', async () => {
    const config = target({ settings: { ...DEFAULT_GLOBAL_CONFIG.defaultSettings, opacity: 60 }, lastPosition: { x: -500, y: 20 }, lastSize: { width: 500, height: 700 } });
    useAppStore.setState({ urlConfigs: [config] });
    await saveTarget({ ...config, name: 'Renamed' });
    expect(useAppStore.getState().urlConfigs[0].lastPosition?.x).toBe(-500);
    expect(native.apply.mock.calls[0][0].settings?.opacity).toBe(60);
  });
  it('all callers observe the same shortcut map and deletion unregisters the newly saved shortcut', async () => {
    const config = target({ hotkey: 'Alt+A' });
    await saveTarget(config);
    expect(checkConflict('alt+a', 'different')).toBe(true);
    await deleteTarget(config.id);
    expect(shortcuts.unregister).toHaveBeenCalledWith('Alt+A');
    expect(useAppStore.getState().urlConfigs).toEqual([]);
  });
  it('uses the same native toggle for repeated list and shortcut operations', async () => {
    const config = target(); useAppStore.setState({ urlConfigs: [config] });
    await toggleTarget(config.id); await toggleTarget(config.id);
    expect(native.toggle).toHaveBeenCalledTimes(2);
    expect(native.toggle.mock.calls[0][0].type).toBe('url');
  });
  it('passes captured targets to the unified dispatcher without creating an empty WebView', async () => {
    const config = target({ type: 'window', url: '' }); useAppStore.setState({ urlConfigs: [config] });
    await toggleTarget(config.id);
    expect(native.toggle.mock.calls[0][0].type).toBe('window');
  });
  it('rolls back the saved configuration on backend failure', async () => {
    const config = target(); useAppStore.setState({ urlConfigs: [config] });
    native.apply.mockRejectedValueOnce(new Error('backend failed'));
    await expect(saveTarget({ ...config, hotkey: 'Alt+Z', name: 'New' })).rejects.toThrow('backend failed');
    expect(useAppStore.getState().urlConfigs[0].name).toBe('Example');
    expect(shortcuts.unregister).toHaveBeenCalledWith('Alt+Z');
  });
  it('inherits defaults only for targets without independent settings', () => {
    const global = structuredClone(DEFAULT_GLOBAL_CONFIG); global.defaultSettings.opacity = 70;
    expect(effectiveSettings(target(), global).opacity).toBe(70);
    expect(effectiveSettings(target({ settings: { ...global.defaultSettings, opacity: 40 } }), global).opacity).toBe(40);
  });
  it('can return to inheritance without unregistering its shortcut', async () => {
    const config = target({ hotkey: 'Alt+X', settings: { ...DEFAULT_GLOBAL_CONFIG.defaultSettings, opacity: 40 } });
    await saveTarget(config);
    await saveTarget({ ...config, settings: undefined });
    expect(native.apply.mock.calls[native.apply.mock.calls.length - 1]?.[0].settings?.opacity).toBe(100);
    expect(shortcuts.unregister).not.toHaveBeenCalled();
  });
});


describe('scene orchestration', () => {
  function setup(count = 3) {
    const members = Array.from({ length: count }, (_, index) => target({ name: `Member ${index}` }));
    const scene = target({ type: 'scene', url: '', memberIds: members.map(item => item.id), hotkey: '' });
    useAppStore.setState({ urlConfigs: [...members, scene] });
    return { members, scene };
  }
  function states(members: UrlConfig[], visibleCount: number): TargetState[] {
    return members.map((item, index) => ({ id: item.id, exists: true, visible: index < visibleCount, minimized: false }));
  }
  it.each([[0, 3, true], [3, 3, false], [2, 3, true], [1, 3, false], [1, 2, true]])('converges %i visible of %i toward show=%s using fresh native states', async (visibleCount, total, show) => {
    const { members, scene } = setup(total);
    // Cached UI deliberately disagrees with native state.
    useAppStore.getState().setRuntime(states(members, total - visibleCount));
    native.states.mockResolvedValue(states(members, visibleCount));
    await toggleTarget(scene.id);
    expect(native.show.mock.calls.map(([config]) => config.id)).toEqual(show ? scene.memberIds : []);
    expect(native.hide.mock.calls.map(([id]) => id)).toEqual(show ? [] : scene.memberIds);
    expect(native.toggle).not.toHaveBeenCalled();
  });
  it('treats minimized windows as hidden and force-show overrides majority', async () => {
    const { members, scene } = setup();
    native.states.mockResolvedValue(states(members, 3).map(item => ({ ...item, minimized: true })));
    await toggleTarget(scene.id);
    expect(native.show).toHaveBeenCalledTimes(3);
    native.states.mockResolvedValue(states(members, 1));
    await toggleTarget(scene.id, true);
    expect(native.show).toHaveBeenCalledTimes(6);
  });
  it('awaits each launch in chosen order and reads current member settings', async () => {
    const { members, scene } = setup();
    const ordered = { ...scene, memberIds: [members[2].id, members[0].id, members[1].id] };
    useAppStore.getState().commitTarget(ordered);
    useAppStore.getState().commitTarget({ ...members[2], settings: { ...DEFAULT_GLOBAL_CONFIG.defaultSettings, opacity: 35 } });
    let release!: () => void;
    native.show.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { visible: true }; });
    const pending = toggleTarget(scene.id);
    await vi.waitFor(() => expect(native.show).toHaveBeenCalledTimes(1));
    expect(native.show.mock.calls[0][0].settings?.opacity).toBe(35);
    release(); await pending;
    expect(native.show.mock.calls.map(([item]) => item.id)).toEqual(ordered.memberIds);
  });
  it('continues after a member failure, refreshes state and reports its name', async () => {
    const { members, scene } = setup();
    native.show.mockRejectedValueOnce(new Error('launch failed'));
    await expect(toggleTarget(scene.id)).rejects.toThrow(`${members[0].name}：Error: launch failed`);
    expect(native.show).toHaveBeenCalledTimes(3);
    expect(native.saveSession).toHaveBeenCalled();
  });
  it('saves scene shortcuts without passing scenes to the native window manager', async () => {
    const { scene } = setup();
    await saveTarget({ ...scene, hotkey: 'Alt+S' });
    expect(shortcuts.register).toHaveBeenCalledWith('Alt+S', expect.any(Function));
    expect(native.apply).not.toHaveBeenCalled();
    expect(native.syncTargets.mock.calls[native.syncTargets.mock.calls.length - 1]?.[0].every(item => item.type !== 'scene')).toBe(true);
    expect(checkConflict('alt+s', 'another')).toBe(true);
    await deleteTarget(scene.id);
    expect(shortcuts.unregister).toHaveBeenCalledWith('Alt+S');
    expect(native.remove).not.toHaveBeenCalled();
    expect(useAppStore.getState().urlConfigs).toHaveLength(3);
  });
  it('removes references with a member, retains empty scenes and refuses to execute them', async () => {
    const { members, scene } = setup(1);
    await deleteTarget(members[0].id);
    expect(useAppStore.getState().urlConfigs[0].memberIds).toEqual([]);
    await expect(toggleTarget(scene.id)).rejects.toThrow('没有可用目标');
    expect(native.show).not.toHaveBeenCalled();
  });
  it('restores member references and runtime if deletion fails', async () => {
    const { members, scene } = setup();
    useAppStore.getState().setRuntime(states(members, 3));
    native.remove.mockRejectedValueOnce(new Error('delete failed'));
    await expect(deleteTarget(members[0].id)).rejects.toThrow('delete failed');
    expect(useAppStore.getState().urlConfigs.find(item => item.id === scene.id)?.memberIds).toEqual(scene.memberIds);
    expect(useAppStore.getState().runtime[scene.id]?.visible).toBe(true);
  });
  it('rejects nested, missing and empty scene members before persistence', async () => {
    const { scene } = setup();
    for (const memberIds of [[], ['missing'], [scene.id]]) {
      await expect(saveTarget({ ...scene, memberIds })).rejects.toThrow();
    }
    expect(native.syncTargets).not.toHaveBeenCalled();
  });
});

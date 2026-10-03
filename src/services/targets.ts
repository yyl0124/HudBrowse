import { register, unregister, isRegistered } from '@tauri-apps/api/globalShortcut';
import { useAppStore } from '@/store/appStore';
import { TargetState, UrlConfig } from '@/types/url-config';
import { effectiveSettings, Storage } from '@/utils/storage';
import { RESERVED_HOTKEYS } from '@/utils/constants';
import { backend } from './backend';
import { changeShortcut } from './hotkeyTransaction';
import { sceneMembers, sceneSummary } from '@/utils/scenes';

const registered = new Map<string, string>();
let queue = Promise.resolve();
let initialization: Promise<void> | undefined;
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = queue.then(action);
  queue = next.then(() => undefined, () => undefined);
  return next;
}
export function reportError(error: unknown) { useAppStore.setState({ error: String(error) }); }
function resolved(config: UrlConfig): UrlConfig {
  return { ...config, settings: effectiveSettings(config, useAppStore.getState().config) };
}
async function syncConfigs() { await backend.syncTargets(useAppStore.getState().urlConfigs.filter(item => item.type !== 'scene').map(resolved)); }
async function refresh() {
  const states = await backend.states();
  useAppStore.getState().setRuntime(states);
  await backend.saveSession();
  return states;
}
function callback(id: string) { return () => { void toggleTarget(id).catch(reportError); }; }
function canonical(key: string) { return key.split('+').map(part => part.trim().replace(/^(Ctrl|Control)$/i, 'CommandOrControl').toLowerCase()).sort().join('+'); }
export function checkConflict(hotkey: string, excludeId?: string) {
  const key = canonical(hotkey);
  return RESERVED_HOTKEYS.some(value => canonical(value) === key) || useAppStore.getState().urlConfigs.some(config => config.id !== excludeId && canonical(config.hotkey) === key);
}

export async function saveTarget(input: UrlConfig) {
  return serialize(async () => {
    const store = useAppStore.getState();
    const before = store.urlConfigs;
    const old = before.find(config => config.id === input.id);
    const runtime = store.runtime[input.id];
    const config = { ...old, ...input,
      lastPosition: runtime?.position ?? input.lastPosition,
      lastSize: runtime?.size ?? input.lastSize,
      updatedAt: Date.now() };
    if (config.type === 'scene') {
      const members = sceneMembers(config, before);
      if (!members.length) throw new Error('请至少选择一个网址或桌面窗口');
      if (members.length !== config.memberIds?.length) throw new Error('场景成员已变更，请重新选择');
      config.url = ''; config.settings = undefined; config.windowInfo = undefined;
      config.lastPosition = undefined; config.lastSize = undefined;
    }
    if (config.type === 'window' && config.windowInfo && before.some(item => item.id !== config.id && item.type === 'window'
      && (store.runtime[item.id]?.hwnd ?? item.windowInfo?.hwnd) === config.windowInfo?.hwnd
      && item.windowInfo?.processId === config.windowInfo?.processId)) throw new Error('该桌面窗口已存在配置');
    if (config.hotkey && checkConflict(config.hotkey, config.id)) throw new Error('快捷键已被占用或为系统保留快捷键');
    await changeShortcut({ register, unregister }, registered.get(config.id), config.hotkey || undefined, callback(config.id),
      async () => {
        store.commitTarget(config);
        if (config.type !== 'scene') await backend.apply(resolved(config));
        await syncConfigs();
      },
      async () => {
        // Restore persistent and in-memory configuration together.
        Storage.saveUrlConfigs(before);
        useAppStore.setState({ urlConfigs: before, runtime: store.runtime });
        if (old && old.type !== 'scene') await backend.apply(resolved(old));
        else if (!old && config.type !== 'scene') await backend.remove(config.id);
        await syncConfigs();
      });
    if (config.hotkey) registered.set(config.id, config.hotkey); else registered.delete(config.id);
    const hotkeyErrors = { ...useAppStore.getState().hotkeyErrors };
    delete hotkeyErrors[config.id];
    useAppStore.setState({ hotkeyErrors });
    await refresh().catch(reportError);
  });
}
export function deleteTarget(id: string) {
  return serialize(async () => {
    const old = useAppStore.getState().urlConfigs;
    const oldRuntime = useAppStore.getState().runtime;
    const key = registered.get(id);
    await changeShortcut({ register, unregister }, key, undefined, callback(id), async () => {
      useAppStore.getState().removeTarget(id);
      if (old.find(item => item.id === id)?.type !== 'scene') await backend.remove(id);
      await syncConfigs();
    }, async () => {
      Storage.saveUrlConfigs(old);
      useAppStore.setState({ urlConfigs: old, runtime: oldRuntime });
      await syncConfigs();
    });
    registered.delete(id);
    await refresh().catch(reportError);
  });
}
export function toggleTarget(id: string, show = false) {
  return serialize(async () => {
    const config = useAppStore.getState().urlConfigs.find(item => item.id === id);
    if (!config) throw new Error('配置不存在');
    if (config.type === 'scene') {
      const states = await backend.states();
      const { members, show: majorityShow } = sceneSummary(config, useAppStore.getState().urlConfigs, Object.fromEntries(states.map(state => [state.id, state])));
      if (!members.length) throw new Error('场景中没有可用目标，请编辑场景添加成员');
      const errors: string[] = [];
      // Await each launch in the chosen order. Never recursively enter the action queue.
      for (const member of members) {
        try { if (show || majorityShow) await backend.show(resolved(member)); else await backend.hide(member.id); }
        catch (error) { errors.push(`${member.name}：${String(error)}`); }
      }
      await refresh().catch(reportError);
      if (errors.length) throw new Error(`场景「${config.name}」部分目标执行失败：${errors.join('；')}`);
      return useAppStore.getState().runtime[id];
    }
    const state = await (show ? backend.show(resolved(config)) : backend.toggle(resolved(config)));
    await refresh().catch(reportError);
    return state;
  });
}
export function applyDefaults() {
  return serialize(async () => {
    for (const config of useAppStore.getState().urlConfigs.filter(item => item.type !== 'scene' && !item.settings)) {
      try { await backend.apply(resolved(config)); } catch (error) { reportError(error); }
    }
    await syncConfigs();
    await refresh();
  });
}
export function refreshTargets() { return serialize(refresh); }
export function applyTarget(id: string) {
  return serialize(async () => {
    const config = useAppStore.getState().urlConfigs.find(item => item.id === id);
    if (config && config.type !== 'scene') await backend.apply(resolved(config));
    await refresh();
  });
}

export function initializeApp() {
  if (initialization) return initialization;
  initialization = (async () => {
    const session = await backend.loadSession();
    await syncConfigs();
    const errors: Record<string, string> = {};
    for (const config of useAppStore.getState().urlConfigs) {
      if (!config.hotkey) continue;
      try {
        if (checkConflict(config.hotkey, config.id)) throw new Error('快捷键冲突');
        if (registered.get(config.id) !== config.hotkey) {
          // isRegistered checks this application's registrations, not another application's shortcuts.
          if (await isRegistered(config.hotkey)) await unregister(config.hotkey);
          await register(config.hotkey, callback(config.id));
        }
        registered.set(config.id, config.hotkey);
      } catch (error) { errors[config.id] = String(error); }
    }
    const options = useAppStore.getState().config;
    await backend.closeToTray(options.closeToTray);
    await backend.tray(options.showInTray);
    const autoStartOnBoot = await backend.getAutoStart();
    useAppStore.getState().updateConfig({ autoStartOnBoot });
    if (options.restoreLastSession) {
      let restore = session.filter(state => state.visible && !state.minimized);
      if (!session.length) {
        try {
          const legacy = JSON.parse(localStorage.getItem('hudbrowse_last_session') || 'null');
          if (Array.isArray(legacy?.openWindows)) restore = legacy.openWindows.map((id: string): TargetState => ({ id, exists: false, visible: true, minimized: false }));
        } catch { /* Invalid legacy sessions are ignored. */ }
      }
      for (const state of restore) {
        const config = useAppStore.getState().urlConfigs.find(item => item.id === state.id);
        // Desktop programs belong to the user. Startup may attach to an existing
        // window via apply below, but only an explicit target/scene action may launch one.
        if (!config || config.type === 'scene' || config.type === 'window') continue;
        try {
          await backend.show(resolved({ ...config, lastPosition: state.position ?? config.lastPosition, lastSize: state.size ?? config.lastSize }));
        } catch (error) { reportError(error); }
      }
    }
    for (const config of useAppStore.getState().urlConfigs.filter(item => item.type === 'window')) {
      try { await backend.apply(resolved(config)); } catch (error) { reportError(error); }
    }
    await refresh();
    useAppStore.setState({ initialized: true, hotkeyErrors: errors });
  })().catch(error => { initialization = undefined; reportError(error); throw error; });
  return initialization;
}

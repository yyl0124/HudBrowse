import { TargetState, UrlConfig } from '@/types/url-config';

export function sceneMembers(scene: Pick<UrlConfig, 'memberIds'>, configs: UrlConfig[]) {
  const targets = new Map(configs.filter(item => item.type !== 'scene').map(item => [item.id, item]));
  return [...new Set(scene.memberIds ?? [])].flatMap(id => targets.get(id) ? [targets.get(id)!] : []);
}

export function isVisible(state?: TargetState) {
  return !!state?.exists && state.visible && !state.minimized;
}

export function sceneSummary(scene: UrlConfig, configs: UrlConfig[], runtime: Record<string, TargetState>) {
  const members = sceneMembers(scene, configs);
  const visible = members.filter(item => isVisible(runtime[item.id])).length;
  // Uniform states toggle; mixed states converge to the majority, with ties showing.
  const show = visible === 0 || (visible < members.length && visible * 2 >= members.length);
  return { members, visible, show };
}

export function withSceneStates(configs: UrlConfig[], runtime: Record<string, TargetState>) {
  const next = Object.fromEntries(Object.entries(runtime).filter(([id]) => configs.some(item => item.id === id && item.type !== 'scene')));
  for (const scene of configs.filter(item => item.type === 'scene')) {
    const { members, visible } = sceneSummary(scene, configs, next);
    next[scene.id] = { id: scene.id, exists: members.some(item => next[item.id]?.exists), visible: members.length > 0 && visible === members.length, minimized: false };
  }
  return next;
}

export function pruneSceneMembers(configs: UrlConfig[]) {
  return configs.map(item => item.type === 'scene' ? { ...item, memberIds: sceneMembers(item, configs).map(member => member.id) } : item);
}

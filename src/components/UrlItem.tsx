import { useState } from 'react';
import { Eye, EyeOff, Pencil, SlidersHorizontal, Trash2, Link, LoaderCircle } from 'lucide-react';
import { UrlConfig } from '@/types/url-config';
import { useAppStore } from '@/store/appStore';
import { toggleTarget, reportError } from '@/services/targets';
import { ContextMenu } from './ContextMenu';
import { TargetIcon } from './TargetIcon';
import { sceneSummary } from '@/utils/scenes';

export function UrlItem({ urlConfig, selected, onSelect, onEdit, onDelete, onSettings, onReconnect }: { urlConfig: UrlConfig; selected: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void; onSettings: () => void; onReconnect: () => void }) {
  const configs = useAppStore(store => store.urlConfigs);
  const categories = useAppStore(store => store.categories);
  const runtime = useAppStore(store => store.runtime);
  const scene = urlConfig.type === 'scene' ? sceneSummary(urlConfig, configs, runtime) : undefined;
  const state = useAppStore(store => store.runtime[urlConfig.id]);
  const hotkeyError = useAppStore(store => store.hotkeyErrors[urlConfig.id]);
  const initialized = useAppStore(store => store.initialized);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const isWindow = urlConfig.type === 'window';
  const category = scene ? '场景' : categories.find(option => option.id === urlConfig.category)?.name ?? '其他';
  return <article className={`target-row ${selected ? 'is-selected' : ''} ${state?.visible ? 'is-active' : ''}`} onContextMenu={event => { event.preventDefault(); if (!isWindow && !scene) setMenu({ x: event.clientX, y: event.clientY }); }}>
    <button className="target-select" aria-label={`选择 ${urlConfig.name}`} aria-pressed={selected} onClick={onSelect}><TargetIcon config={urlConfig} active={!!state?.visible} /><span className="target-information"><span className="target-name-line"><span role="heading" aria-level={2} className="target-name">{urlConfig.name}</span><span className="target-category" data-category={urlConfig.category}>{category}</span></span><span className="target-destination" title={isWindow ? urlConfig.windowInfo?.exePath : urlConfig.url}>{scene ? (scene.members.map(item => item.name).join(' → ') || '尚无成员') : isWindow ? urlConfig.windowInfo?.exePath : urlConfig.url}</span><span className="target-meta"><span className="target-shortcut">{urlConfig.hotkey || '无快捷键'}</span><span className="meta-dot">·</span><span>{scene ? `${scene.members.length} 个目标 · 按序唤醒` : urlConfig.settings ? '独立配置' : '全局默认'}</span></span></span></button>
    <div className="target-trailing"><span className={`target-state ${state?.visible ? 'is-active' : ''}`}><span className={`status-dot ${state?.visible ? '' : 'is-muted'}`} />{scene ? !scene.members.length ? '待添加' : scene.visible === scene.members.length ? '全部显示' : scene.visible ? '部分显示' : '待唤醒' : state?.visible ? '显示中' : state?.exists ? '已隐藏' : isWindow ? '待连接' : '未打开'}</span><div className="target-actions"><button className={`icon-button visibility-button ${state?.visible ? 'is-active' : ''}`} disabled={busy || !initialized} title={scene ? (scene.show ? '全部唤醒' : '全部隐藏') : state?.visible ? '隐藏窗口' : '显示窗口'} aria-label={scene ? `执行场景 ${urlConfig.name}` : state?.visible ? '隐藏窗口' : '显示窗口'} onClick={async () => { setBusy(true); try { await toggleTarget(urlConfig.id); } catch (error) { reportError(error); } finally { setBusy(false); } }}>{busy ? <LoaderCircle size={17} className="is-spinning" /> : state?.visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>{!scene && <button className="icon-button" title="窗口设置" aria-label="窗口设置" onClick={onSettings}><SlidersHorizontal size={17} /></button>}<button className="icon-button secondary-row-action" title="编辑" aria-label="编辑" onClick={onEdit}><Pencil size={16} /></button>{isWindow && <button className="icon-button secondary-row-action" title="重新选择窗口" aria-label="重新选择窗口" onClick={onReconnect}><Link size={16} /></button>}<button className="icon-button delete-row-action" title="删除" aria-label="删除" onClick={onDelete}><Trash2 size={16} /></button></div></div>
    {hotkeyError && <p role="alert" className="target-error">快捷键注册失败：{hotkeyError}</p>}
    {menu && <ContextMenu windowId={urlConfig.id} {...menu} onClose={() => setMenu(undefined)} />}
  </article>;
}

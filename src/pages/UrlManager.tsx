import { useMemo, useRef, useState } from 'react';
import { AppWindow, ArrowDownWideNarrow, ArrowUpRight, CircleDot, Globe, Layers, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { UrlConfig, WindowInfo } from '@/types/url-config';
import { useAppStore } from '@/store/appStore';
import { deleteTarget, saveTarget, reportError, toggleTarget } from '@/services/targets';
import { effectiveSettings } from '@/utils/storage';
import { UrlItem } from '@/components/UrlItem';
import { TargetIcon } from '@/components/TargetIcon';
import { SceneDialog } from '@/components/SceneDialog';
import { SceneDetails } from '@/components/SceneDetails';
import { AddUrlDialog } from '@/components/AddUrlDialog';
import { WindowSettings } from '@/components/WindowSettings';
import { WindowCapture } from '@/components/WindowCapture';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { useContentMotion } from '@/hooks/useContentMotion';
import { SelectionIndicator } from '@/components/ui/SelectionIndicator';
import { Presence } from '@/components/ui/Presence';
import { Select } from '@/components/ui/Select';
import { DetailScrollArea } from '@/components/ui/DetailScrollArea';

export function UrlManager() {
  const configs = useAppStore(state => state.urlConfigs);
  const categories = useAppStore(state => state.categories);
  const runtime = useAppStore(state => state.runtime);
  const initialized = useAppStore(state => state.initialized);
  const [editing, setEditing] = useState<UrlConfig | null | undefined>();
  const [editingScene, setEditingScene] = useState<UrlConfig | null | undefined>();
  const [settingsId, setSettingsId] = useState<string>();
  const [capture, setCapture] = useState(false);
  const [rebindId, setRebindId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'url' | 'window' | 'scene'>('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('created');
  const [deleting, setDeleting] = useState<UrlConfig>();
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const settings = configs.find(config => config.id === settingsId);
  const list = useMemo(() => {
    const term = query.trim().toLowerCase();
    return configs.filter(config => (filter === 'all' || (config.type ?? 'url') === filter) && (category === 'all' || config.category === category)
      && `${config.name} ${config.url} ${config.windowInfo?.exePath ?? ''} ${config.hotkey}`.toLowerCase().includes(term))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort === 'active' ? Number(!!runtime[b.id]?.visible) - Number(!!runtime[a.id]?.visible) || b.createdAt - a.createdAt : b.createdAt - a.createdAt);
  }, [configs, query, filter, category, sort, runtime]);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  useContentMotion(listRef, JSON.stringify([filter, category, sort, list.map(item => item.id)]), '.target-row, .empty-state');
  const selected = list.find(config => config.id === selectedId) ?? list[0];
  useContentMotion(detailRef, selected?.id ?? 'empty', '.inspector-scroll-content, .inspector-idle');
  const selectWindow = (windowInfo: WindowInfo) => {
    setCapture(false);
    if (rebindId) {
      const config = configs.find(item => item.id === rebindId);
      setRebindId(undefined);
      if (config) void saveTarget({ ...config, windowInfo }).catch(reportError);
    } else setEditing({ id: `window_${crypto.randomUUID()}`, type: 'window', url: '', name: windowInfo.title || '未命名窗口', hotkey: '', windowInfo, createdAt: Date.now(), updatedAt: Date.now() });
  };
  const visibleCount = configs.filter(config => config.type !== 'scene' && runtime[config.id]?.visible).length;
  return <section className="target-workspace">
    <div className="workspace-heading"><div><p className="brand-tagline">常用窗口，随手即达</p><h1>悬浮空间</h1></div><div className="workspace-metrics"><div><strong>{String(configs.length).padStart(2, '0')}</strong><span>全部目标</span></div><div className="metric-active"><strong>{String(visibleCount).padStart(2, '0')}</strong><span><span className="status-dot" />显示中</span></div><div><strong>{String(configs.filter(config => config.hotkey).length).padStart(2, '0')}</strong><span>快捷键</span></div></div></div>
    <div className="workspace-commandbar"><div className="view-segments" role="group" aria-label="目标类型"><SelectionIndicator value={filter} />{([{ value: 'all', label: '全部', icon: CircleDot }, { value: 'url', label: '网址', icon: Globe }, { value: 'window', label: '桌面', icon: AppWindow }, { value: 'scene', label: '场景', icon: Layers }] as const).map(item => <button key={item.value} className={filter === item.value ? 'is-selected' : ''} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}><item.icon size={15} />{item.label}<span>{configs.filter(config => item.value === 'all' || (config.type ?? 'url') === item.value).length}</span></button>)}</div><div className="workspace-actions"><button className="btn btn-secondary" disabled={!initialized} onClick={() => { setRebindId(undefined); setCapture(true); }}><AppWindow size={16} />捕获窗口</button><button className="btn btn-scene" disabled={!initialized} onClick={() => setEditingScene(null)}><Layers size={15} />添加场景</button><button className="btn btn-primary" disabled={!initialized} onClick={() => setEditing(null)}><Plus size={17} />添加网址</button></div></div>
    <div className="workbench"><div className="target-library"><div className="library-toolbar"><label className="search-field"><Search size={16} /><input aria-label="搜索目标" placeholder="搜索名称、网址或快捷键" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" title="清空搜索" aria-label="清空搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label><div className="toolbar-select"><SlidersHorizontal size={15} /><Select label="筛选分类" value={category} onChange={setCategory} options={[{ value: 'all', label: '全部分类' }, ...categories.map(item => ({ value: item.id, label: item.name }))]} /></div><div className="toolbar-select"><ArrowDownWideNarrow size={17} /><Select label="排序目标" value={sort} onChange={setSort} options={[{ value: 'created', label: '最近添加' }, { value: 'name', label: '名称排序' }, { value: 'active', label: '活跃优先' }]} /></div></div>
      <div className="library-column-head"><span>目标</span><span>状态与操作</span></div>
      <div ref={listRef} className="target-list">{!list.length && <div className="empty-state"><span className="empty-symbol"><CircleDot size={38} strokeWidth={1} /></span><h2>{configs.length ? '没有匹配的目标' : '空间已就绪'}</h2><p>{configs.length ? '无搜索结果' : '暂无网址或桌面窗口'}</p>{configs.length ? <Button variant="secondary" onClick={() => { setQuery(''); setFilter('all'); setCategory('all'); }}>清除筛选</Button> : <button className="btn btn-primary" disabled={!initialized} onClick={() => setEditing(null)}><Plus size={16} />添加第一个网址</button>}</div>}
      {list.map(config => <UrlItem key={config.id} urlConfig={config} selected={selected?.id === config.id} onSelect={() => setSelectedId(config.id)} onEdit={() => config.type === 'scene' ? setEditingScene(config) : setEditing(config)} onSettings={() => setSettingsId(config.id)} onReconnect={() => { setRebindId(config.id); setCapture(true); }} onDelete={() => { setDeleteError(''); setDeleting(config); }} />)}</div>
    </div><aside ref={detailRef} className="target-inspector" aria-label="选中目标详情">{selected?.type === 'scene' ? <SceneDetails config={selected} onEdit={() => setEditingScene(selected)} /> : selected ? <TargetDetails config={selected} onSettings={() => setSettingsId(selected.id)} /> : <div className="inspector-idle"><CircleDot size={50} strokeWidth={1} /><span>暂无目标</span></div>}</aside></div>
    <Presence>{editingScene !== undefined && <SceneDialog scene={editingScene} onClose={() => setEditingScene(undefined)} />}</Presence>
    <Presence>{editing !== undefined && <AddUrlDialog editingUrl={editing} onClose={() => setEditing(undefined)} />}</Presence>
    <Presence>{!!settings && <WindowSettings urlConfig={settings} onClose={() => setSettingsId(undefined)} />}</Presence>
    <Presence>{capture && <WindowCapture onCapture={selectWindow} onCancel={() => { setCapture(false); setRebindId(undefined); }} />}</Presence>
    <Presence>{!!deleting && <Modal title="移除目标" onClose={() => setDeleting(undefined)} busy={busy}><div className="confirmation-content"><TargetIcon config={deleting} /><strong>{deleting.name}</strong><p>{deleting.type === 'scene' ? '只移除场景，成员的窗口和配置会保留。' : deleting.type === 'window' ? '移除后，桌面窗口恢复原始状态。' : '移除配置并关闭该网址浮窗。'}</p></div>{deleteError && <p role="alert" className="form-error">{deleteError}</p>}<div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setDeleting(undefined)}>取消</Button><Button variant="danger" disabled={busy} onClick={async () => { setBusy(true); try { await deleteTarget(deleting.id); setDeleting(undefined); } catch (error) { setDeleteError(String(error)); } finally { setBusy(false); } }}>{busy ? '移除中' : '确认移除'}</Button></div></Modal>}</Presence>
  </section>;
}

function TargetDetails({ config, onSettings }: { config: UrlConfig; onSettings: () => void }) {
  const global = useAppStore(state => state.config);
  const runtime = useAppStore(state => state.runtime[config.id]);
  const initialized = useAppStore(state => state.initialized);
  const settings = effectiveSettings(config, global);
  const [busy, setBusy] = useState(false);
  const visible = !!runtime?.visible;
  const hideMode = settings.autoHideOnEdge ? '贴边' : settings.hideOnMouseLeave ? '移出' : '关闭';
  return <>
    <DetailScrollArea key={config.id}>
    <div className="inspector-heading"><span className="inspector-type">{config.type === 'window' ? <AppWindow size={14} /> : <Globe size={14} />}{config.type === 'window' ? '桌面窗口' : '网址浮窗'}</span></div>
    <div className="inspector-identity"><TargetIcon config={config} active={visible} /><strong>{config.name}</strong><span>{config.type === 'window' ? config.windowInfo?.className : (() => { try { return new URL(config.url).hostname; } catch { return config.url; } })()}</span></div>
    <div className={`inspector-state ${visible ? 'is-active' : ''}`}><span className={`status-dot ${visible ? '' : 'is-muted'}`} />{visible ? '窗口正在显示' : runtime?.exists ? '窗口已隐藏' : config.type === 'window' ? '等待连接' : '尚未打开'}<span>{config.settings ? '独立设置' : '继承默认'}</span></div>
    <div className="inspector-facts"><div><span>透明度</span><strong>{settings.opacity}<small>%</small></strong></div><div><span>隐藏模式</span><strong>{hideMode}</strong></div></div>
    <dl className="inspector-properties"><div><dt>窗口尺寸</dt><dd>{Math.round(runtime?.size?.width ?? settings.defaultWidth)} <span>×</span> {Math.round(runtime?.size?.height ?? settings.defaultHeight)}</dd></div><div><dt>窗口置顶</dt><dd>{settings.alwaysOnTop ? '开启' : '关闭'}</dd></div><div><dt>鼠标穿透</dt><dd>{settings.mouseThrough ? '开启' : '关闭'}</dd></div><div><dt>快捷键</dt><dd className="shortcut-value">{config.hotkey || '未设置'}</dd></div></dl>
    <div className="inspector-address"><span className="eyebrow">{config.type === 'window' ? '程序位置' : '网址'}</span><p>{config.type === 'window' ? config.windowInfo?.exePath : config.url}</p></div>
    </DetailScrollArea><div className="inspector-buttons"><button className="btn btn-primary" aria-label={`${visible ? '隐藏' : '显示'} ${config.name}`} disabled={busy || !initialized} onClick={async () => { setBusy(true); try { await toggleTarget(config.id); } catch (error) { reportError(error); } finally { setBusy(false); } }}><ArrowUpRight size={16} />{busy ? '处理中' : visible ? '隐藏窗口' : '打开窗口'}</button><button className="btn btn-secondary" aria-label="详细窗口设置" onClick={onSettings}><SlidersHorizontal size={16} />调整设置</button></div>
  </>;
}

import { useRef, useState } from 'react';
import { AppWindow, Check, CircleDot, Moon, Palette, RotateCcw, Settings2, Sun, Tags } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { backend } from '@/services/backend';
import { reportError } from '@/services/targets';
import { DEFAULT_GLOBAL_CONFIG } from '@/types/settings';
import { WindowOptions } from '@/components/WindowOptions';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { useContentMotion } from '@/hooks/useContentMotion';
import { SelectionIndicator } from '@/components/ui/SelectionIndicator';
import { Presence } from '@/components/ui/Presence';
import { Modal } from '@/components/Modal';
import { CategoryManager } from '@/components/CategoryManager';

export function Settings() {
  const { config, updateConfig } = useSettings();
  const [tab, setTab] = useState<'windows' | 'application' | 'appearance' | 'categories'>('windows');
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useContentMotion(panelRef, tab);
  const native = async (action: () => Promise<void>, updates: Parameters<typeof updateConfig>[0]) => {
    setBusy(true);
    try { await action(); updateConfig(updates); } catch (error) { reportError(error); } finally { setBusy(false); }
  };
  return <section className="settings-workspace"><div className="workspace-heading"><div><h1>全局设置</h1><span className="heading-subtitle">默认偏好与应用设置</span></div><span className="saved-indicator"><Check size={14} />{busy ? '应用中' : '自动保存'}</span></div>
    <div className="settings-navigation" role="tablist" aria-label="设置分类" onKeyDown={event => {
      const tabs = ['windows', 'application', 'appearance', 'categories'] as const;
      const index = tabs.indexOf(tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus(); }
    }}><SelectionIndicator value={tab} />{([{ value: 'windows', label: '窗口', icon: AppWindow }, { value: 'application', label: '应用', icon: Settings2 }, { value: 'appearance', label: '外观', icon: Palette }, { value: 'categories', label: '分类', icon: Tags }] as const).map(item => <button key={item.value} id={`tab-${item.value}`} role="tab" tabIndex={tab === item.value ? 0 : -1} aria-selected={tab === item.value} aria-controls={`panel-${item.value}`} className={tab === item.value ? 'is-selected' : ''} onClick={() => setTab(item.value)}><item.icon size={17} />{item.label}</button>)}</div>
    <div ref={panelRef} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="settings-panel">
      {tab === 'windows' && <><div className="section-heading"><h2>默认窗口设置</h2></div><WindowOptions value={config.defaultSettings} onChange={defaultSettings => updateConfig({ defaultSettings })} /></>}
      {tab === 'application' && <><div className="section-heading"><h2>启动与常驻</h2></div><div className="application-options"><Toggle icon={<CircleDot size={18} />} label="开机自启动" disabled={busy} checked={config.autoStartOnBoot} onChange={autoStartOnBoot => void native(() => backend.autoStart(autoStartOnBoot), { autoStartOnBoot })} /><Toggle icon={<AppWindow size={18} />} label="显示托盘图标" disabled={busy} checked={config.showInTray} onChange={showInTray => void native(() => backend.tray(showInTray), { showInTray })} /><Toggle icon={<AppWindow size={18} />} label="关闭时最小化到托盘" disabled={busy} checked={config.closeToTray} onChange={closeToTray => void native(() => backend.closeToTray(closeToTray), { closeToTray })} /><Toggle icon={<RotateCcw size={18} />} label="恢复上次可见网页" checked={config.restoreLastSession} onChange={restoreLastSession => updateConfig({ restoreLastSession })} /></div><p className="heading-subtitle">{config.closeToTray ? (config.showInTray ? '点击关闭按钮后，程序继续在托盘运行。' : '托盘图标已关闭，点击关闭按钮后将最小化到任务栏。') : '点击关闭按钮后，退出 HudBrowse。'}</p></>}
      {tab === 'appearance' && <><div className="section-heading"><h2>色彩主题</h2></div><div className="theme-picker" role="group" aria-label="色彩主题">{([{ value: 'dark', label: '墨黑', icon: Moon }, { value: 'light', label: '银白', icon: Sun }] as const).map(theme => <button key={theme.value} className={`theme-choice ${theme.value} ${config.theme === theme.value ? 'is-selected' : ''}`} aria-pressed={config.theme === theme.value} onClick={() => updateConfig({ theme: theme.value })}><span className="theme-sample"><span className="sample-island" /><span className="sample-workspace"><i /><i /><i /></span></span><span className="theme-label"><theme.icon size={16} />{theme.label}{config.theme === theme.value && <Check size={16} />}</span></button>)}</div></>}
      {tab === 'categories' && <CategoryManager />}
    </div>
    <div className="settings-bottom"><button className="text-button danger-text" disabled={busy} onClick={() => setReset(true)}><RotateCcw size={14} />恢复默认设置</button></div>
    <Presence>{reset && <Modal title="恢复默认设置" onClose={() => setReset(false)} busy={busy}><p className="confirmation-description">恢复全局窗口偏好、主题和应用设置。独立窗口配置保持不变。</p><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setReset(false)}>取消</Button><Button variant="danger" disabled={busy} onClick={async () => { setBusy(true); try { await backend.autoStart(false); await backend.tray(true); await backend.closeToTray(true); updateConfig(structuredClone(DEFAULT_GLOBAL_CONFIG)); setReset(false); } catch (error) { reportError(error); } finally { setBusy(false); } }}>{busy ? '恢复中' : '确认恢复'}</Button></div></Modal>}</Presence>
  </section>;
}

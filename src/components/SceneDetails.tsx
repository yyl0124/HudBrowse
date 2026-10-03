import { useState } from 'react';
import { Layers, Pencil, Play } from 'lucide-react';
import { UrlConfig } from '@/types/url-config';
import { useAppStore } from '@/store/appStore';
import { isVisible, sceneSummary } from '@/utils/scenes';
import { reportError, toggleTarget } from '@/services/targets';
import { TargetIcon } from './TargetIcon';
import { DetailScrollArea } from './ui/DetailScrollArea';

export function SceneDetails({ config, onEdit }: { config: UrlConfig; onEdit: () => void }) {
  const configs = useAppStore(state => state.urlConfigs);
  const runtime = useAppStore(state => state.runtime);
  const initialized = useAppStore(state => state.initialized);
  const [busy, setBusy] = useState(false);
  const { members, visible, show } = sceneSummary(config, configs, runtime);
  return <>
    <DetailScrollArea key={config.id}>
      <div className="inspector-heading"><span className="inspector-type"><Layers size={14} />组合场景</span></div>
      <div className="inspector-identity scene-identity"><TargetIcon config={config} active={!!members.length && visible === members.length} /><strong>{config.name}</strong></div>
      <div className={`inspector-state ${visible ? 'is-active' : ''}`}><span className={`status-dot ${visible ? '' : 'is-muted'}`} />{!members.length ? '尚无成员' : visible === members.length ? '全部显示' : visible ? `${visible} 个显示 · ${members.length - visible} 个隐藏` : '全部隐藏或未启动'}</div>
      <dl className="inspector-properties"><div><dt>快捷键</dt><dd className="shortcut-value">{config.hotkey || '未设置'}</dd></div><div><dt>窗口配置</dt><dd>沿用各目标设置</dd></div></dl>
      <div className="scene-member-details"><span className="eyebrow">启动顺序</span><ol>{members.map((member, index) => <li key={member.id}><span className="scene-step">{index + 1}</span><TargetIcon config={member} /><span className="scene-choice-name"><strong>{member.name}</strong><small>{isVisible(runtime[member.id]) ? '显示中' : runtime[member.id]?.exists ? '已隐藏' : '未启动'}</small></span><span className={`status-dot ${isVisible(runtime[member.id]) ? '' : 'is-muted'}`} /></li>)}</ol>{!members.length && <p className="scene-empty">成员已移除，请编辑场景重新选择。</p>}</div>
    </DetailScrollArea>
    <div className="inspector-buttons"><button className="btn btn-primary" aria-label={`执行场景 ${config.name}`} disabled={busy || !initialized || !members.length} onClick={async () => { setBusy(true); try { await toggleTarget(config.id); } catch (error) { reportError(error); } finally { setBusy(false); } }}><Play size={16} />{busy ? '依次处理中' : show ? '全部唤醒' : '全部隐藏'}</button><button className="btn btn-secondary" onClick={onEdit}><Pencil size={16} />编辑场景</button></div>
  </>;
}

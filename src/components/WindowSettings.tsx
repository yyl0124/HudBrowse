import { useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { UrlConfig } from '@/types/url-config';
import { useSettings } from '@/hooks/useSettings';
import { saveTarget } from '@/services/targets';
import { WindowOptions } from './WindowOptions';
import { Modal } from './Modal';
import { Toggle } from './ui/Toggle';
import { Button } from './ui/Button';
import { TargetIcon } from './TargetIcon';

export function WindowSettings({ urlConfig, onClose }: { urlConfig: UrlConfig; onClose: () => void }) {
  const { config } = useSettings();
  const [custom, setCustom] = useState(!!urlConfig.settings);
  const [settings, setSettings] = useState(urlConfig.settings ?? { ...config.defaultSettings });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <Modal title={`窗口设置 · ${urlConfig.name}`} onClose={onClose} busy={busy}>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try { await saveTarget({ ...urlConfig, settings: custom ? settings : undefined }); onClose(); }
      catch (error) { setError(String(error)); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}><div className="dialog-target"><TargetIcon config={urlConfig} small /><div><strong>{urlConfig.name}</strong><span>{urlConfig.type === 'window' ? '桌面窗口' : '网址浮窗'}</span></div><span className="section-tag">{custom ? '独立设置' : '继承默认'}</span></div>
      <div className="configuration-mode"><Toggle icon={<SlidersHorizontal size={18} />} label="使用独立设置" checked={custom} disabled={busy} onChange={setCustom} /></div>
      {custom ? <WindowOptions value={settings} onChange={setSettings} /> : <div className="inherited-summary"><span className="eyebrow">全局默认</span><dl><div><dt>透明度</dt><dd>{config.defaultSettings.opacity}%</dd></div><div><dt>隐藏模式</dt><dd>{config.defaultSettings.autoHideOnEdge ? '贴边隐藏' : config.defaultSettings.hideOnMouseLeave ? '移出隐藏' : '关闭'}</dd></div><div><dt>窗口尺寸</dt><dd>{config.defaultSettings.defaultWidth} × {config.defaultSettings.defaultHeight}</dd></div></dl></div>}
      </fieldset>{error && <p role="alert" className="form-error">{error}</p>}
      <div className="form-actions"><button className="text-button reset-inherit" type="button" disabled={busy} onClick={() => { setSettings({ ...config.defaultSettings }); setCustom(false); }}><RotateCcw size={14} />继承全局默认</button><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy}><Check size={15} />{busy ? '保存中' : '应用'}</Button></div>
    </form>
  </Modal>;
}

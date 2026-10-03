import { ArrowDownToLine, Expand, MousePointer2, MoveUpRight, Pin, ScanLine } from 'lucide-react';
import { WindowSettings } from '@/types/url-config';
import { Toggle } from './ui/Toggle';
import { Slider } from './ui/Slider';

export function WindowOptions({ value, onChange }: { value: WindowSettings; onChange: (settings: WindowSettings) => void }) {
  return <div className="window-options">
    <div className="opacity-option"><span className="option-icon"><ScanLine size={20} /></span><Slider label="透明度" value={value.opacity} min={10} max={100} onChange={opacity => onChange({ ...value, opacity })} /></div>
    <div className="behavior-options"><Toggle icon={<ArrowDownToLine size={18} />} label="贴边隐藏" checked={value.autoHideOnEdge} onChange={autoHideOnEdge => onChange({ ...value, autoHideOnEdge, hideOnMouseLeave: autoHideOnEdge ? false : value.hideOnMouseLeave })} /><Toggle icon={<MoveUpRight size={18} />} label="移出隐藏" checked={value.hideOnMouseLeave} onChange={hideOnMouseLeave => onChange({ ...value, hideOnMouseLeave, autoHideOnEdge: hideOnMouseLeave ? false : value.autoHideOnEdge })} /><Toggle icon={<MousePointer2 size={18} />} label="鼠标穿透" checked={value.mouseThrough} onChange={mouseThrough => onChange({ ...value, mouseThrough })} /><Toggle icon={<Pin size={18} />} label="窗口置顶" checked={value.alwaysOnTop} onChange={alwaysOnTop => onChange({ ...value, alwaysOnTop })} /></div>
    <div className="dimension-option"><span className="option-icon"><Expand size={19} /></span><div className="dimension-inputs"><label className="field-label">默认宽度<div className="unit-input"><input aria-label="默认宽度" type="number" required min={200} max={3840} value={value.defaultWidth} onChange={event => onChange({ ...value, defaultWidth: Number(event.target.value) })} /><span>px</span></div></label><span className="dimension-separator">×</span><label className="field-label">默认高度<div className="unit-input"><input aria-label="默认高度" type="number" required min={200} max={2160} value={value.defaultHeight} onChange={event => onChange({ ...value, defaultHeight: Number(event.target.value) })} /><span>px</span></div></label></div></div>
  </div>;
}

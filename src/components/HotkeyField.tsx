import { useEffect, useState } from 'react';
import { Circle, Keyboard, Square } from 'lucide-react';

export function HotkeyField({ value, onChange, onError, onRecording }: { value: string; onChange: (value: string) => void; onError: (error: string) => void; onRecording: (value: boolean) => void }) {
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    onRecording(recording);
    if (!recording) return;
    const timer = setTimeout(() => setRecording(false), 5000);
    const handler = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { setRecording(false); return; }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
      const keys = [event.ctrlKey || event.metaKey ? 'CommandOrControl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean);
      if (!keys.length && !/^F\d+$/.test(event.key)) { onError('请选择带修饰键的组合或功能键'); return; }
      const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
      onChange([...keys, key].join('+')); setRecording(false); onError('');
    };
    document.addEventListener('keydown', handler, true);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handler, true); };
  }, [recording, onChange, onError, onRecording]);
  return <div className="field-label"><span>快捷键</span><div className={`hotkey-input ${recording ? 'is-recording' : ''}`}><Keyboard size={17} /><input aria-label="快捷键" value={value} onChange={event => onChange(event.target.value)} placeholder={recording ? '正在录制…' : '未设置'} readOnly={recording} /><button type="button" className="icon-button" title={recording ? '停止录制' : '录制快捷键'} aria-label={recording ? '停止录制' : '录制快捷键'} onClick={() => setRecording(!recording)}>{recording ? <Square size={15} /> : <Circle size={15} />}</button></div></div>;
}

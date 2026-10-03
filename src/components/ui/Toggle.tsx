import { ReactNode } from 'react';

export function Toggle({ label, checked, onChange, disabled = false, icon }: { label?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; icon?: ReactNode }) {
  return <div className={`toggle-row ${disabled ? 'is-disabled' : ''}`}><span className="toggle-label">{icon && <span className="option-icon">{icon}</span>}<span>{label}</span></span><button type="button" role="switch" aria-checked={checked} aria-label={label || '切换'} disabled={disabled} onClick={() => onChange(!checked)} className={`toggle-control ${checked ? 'is-checked' : ''}`}><span /></button></div>;
}

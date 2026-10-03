import { InputHTMLAttributes, useId } from 'react';

export function Input({ label, error, className = '', id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <div className="field-label">{label && <label htmlFor={inputId}>{label}</label>}<input id={inputId} className={`input ${className}`} aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} {...props} />{error && <p id={`${inputId}-error`} className="form-error">{error}</p>}</div>;
}

import { TextareaHTMLAttributes } from 'react';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  success?: boolean;
}

export default function Textarea({ label, error, helperText, success, className = '', id, ...props }: Props) {
  const inputId = id || label?.replace(/\s+/g, '-').toLowerCase();
  const borderClass = error
    ? '!border-red-400/50 focus:!border-red-400/60'
    : success
    ? '!border-emerald-400/40 focus:!border-emerald-400/60'
    : '';

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-[12px] font-medium text-gray-500 mb-1.5 ml-1 transition-colors">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={`input-glass w-full resize-y ${borderClass} ${className}`}
        {...props}
      />
      {helperText && !error && <p className="mt-1 text-[11px] text-gray-500 ml-1">{helperText}</p>}
      {error && <p className="mt-1 text-[11px] text-red-400 ml-1">{error}</p>}
    </div>
  );
}

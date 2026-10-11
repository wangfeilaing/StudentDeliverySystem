import { InputHTMLAttributes, ReactNode } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  success?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export default function Input({ label, error, helperText, success, leadingIcon, trailingIcon, className = '', id, ...props }: Props) {
  const inputId = id || label?.replace(/\s+/g, '-').toLowerCase();
  const borderClass = error ? '!border-red-400/50 focus:!border-red-400/60' : success ? '!border-emerald-400/40 focus:!border-emerald-400/60' : '';

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-[12px] font-medium text-gray-500 mb-1.5 ml-1 transition-colors">
          {label}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 flex items-center justify-center">
            {leadingIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`input-glass w-full ${leadingIcon ? 'pl-9' : ''} ${trailingIcon ? 'pr-9' : ''} ${borderClass} ${className}`}
          {...props}
        />
        {trailingIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 flex items-center justify-center">
            {trailingIcon}
          </div>
        )}
      </div>
      {helperText && !error && <p className="mt-1 text-[11px] text-gray-500 ml-1">{helperText}</p>}
      {error && <p className="mt-1 text-[11px] text-red-400 ml-1">{error}</p>}
    </div>
  );
}

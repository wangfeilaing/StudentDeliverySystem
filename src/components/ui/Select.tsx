import { SelectHTMLAttributes } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
}

export default function Select({ label, error, helperText, options, className = '', id, ...props }: Props) {
  const selectId = id || label?.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-[12px] font-medium text-gray-500 mb-1.5 ml-1">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`input-glass w-full appearance-none ${error ? '!border-red-400/50' : ''} ${className}`}
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
          backgroundPosition: "right 10px center",
          backgroundSize: "18px",
          paddingRight: "36px",
          backgroundRepeat: "no-repeat",
        }}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {helperText && !error && <p className="mt-1 text-[11px] text-gray-500 ml-1">{helperText}</p>}
      {error && <p className="mt-1 text-[12px] text-red-400 ml-1">{error}</p>}
    </div>
  );
}

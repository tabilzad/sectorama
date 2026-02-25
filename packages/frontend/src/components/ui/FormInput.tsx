import type { InputHTMLAttributes } from 'react';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  extraClassName?: string;
}

export function FormInput({ label, extraClassName = '', className, ...props }: FormInputProps) {
  const inputClass = className ??
    `w-full bg-surface-200 border border-surface-300 rounded-lg px-3 py-2 text-sm text-gray-200
     placeholder-gray-600 focus:outline-none focus:border-accent ${extraClassName}`;
  return (
    <div>
      {label && <label className="block text-xs text-gray-500 mb-1">{label}</label>}
      <input className={inputClass} {...props} />
    </div>
  );
}

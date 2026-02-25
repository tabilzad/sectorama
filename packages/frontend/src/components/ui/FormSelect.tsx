import type { SelectHTMLAttributes, ReactNode } from 'react';

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export function FormSelect({ label, children, className, ...props }: FormSelectProps) {
  const selectClass = className ??
    'w-full bg-surface-200 border border-surface-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent';
  return (
    <div>
      {label && <label className="block text-xs text-gray-500 mb-1">{label}</label>}
      <select className={selectClass} {...props}>
        {children}
      </select>
    </div>
  );
}

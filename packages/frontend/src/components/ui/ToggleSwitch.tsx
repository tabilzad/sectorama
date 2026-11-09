interface ToggleSwitchProps {
  checked:   boolean;
  onChange:  () => void;
  /** Accessible name; the visible heading next to the switch is not associated with it. */
  label:     string;
  disabled?: boolean;
}

export default function ToggleSwitch({ checked, onChange, label, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand
        ${checked ? 'bg-brand' : 'bg-surface-300'}
        disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
          transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

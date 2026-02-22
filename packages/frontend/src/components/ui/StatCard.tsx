interface StatCardProps {
  label:     string;
  value:     string | number;
  sublabel?: string;
  accent?:   boolean;
}

export default function StatCard({ label, value, sublabel, accent }: StatCardProps) {
  return (
    <div className={`card flex flex-col gap-1 ${accent ? 'border-accent/40' : ''}`}>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${accent ? 'text-accent-light' : 'text-white'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sublabel && <span className="text-xs text-gray-500">{sublabel}</span>}
    </div>
  );
}

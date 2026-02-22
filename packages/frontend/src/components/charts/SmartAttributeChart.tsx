import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface SmartPoint {
  timestamp: string;
  value:     number;
  rawValue:  number;
}

interface SmartAttributeChartProps {
  points:    SmartPoint[];
  attrName:  string;
  height?:   number;
}

const FORMAT_DATE = (ts: string) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function SmartAttributeChart({ points, attrName, height = 280 }: SmartAttributeChartProps) {
  if (!points.length) {
    return <p className="text-gray-500 text-sm py-8 text-center">No history data yet.</p>;
  }

  const data = points.map(p => ({
    time:     p.timestamp,
    value:    p.value,
    rawValue: p.rawValue,
  }));

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        {attrName} — {points.length} data point{points.length !== 1 ? 's' : ''}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333345" />
          <XAxis
            dataKey="time"
            tickFormatter={FORMAT_DATE}
            stroke="#666"
            tick={{ fill: '#999', fontSize: 10 }}
            angle={-30}
            textAnchor="end"
          />
          <YAxis
            stroke="#666"
            tick={{ fill: '#999', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a24', border: '1px solid #333345', borderRadius: 6 }}
            labelStyle={{ color: '#999' }}
            labelFormatter={val => FORMAT_DATE(val as string)}
          />
          <Legend wrapperStyle={{ color: '#999', fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="value"
            name="Value"
            stroke="#2b908f"
            strokeWidth={2}
            dot={{ fill: '#2b908f', r: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rawValue"
            name="Raw"
            stroke="#7798BF"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

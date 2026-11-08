import { useAlertHistory } from '@/api/hooks/useNotifications.ts';
import type { AlertDeliveryStatus, AlertEventType, AlertHistoryEntry } from '@sectorama/shared';

const TYPE_LABEL: Record<AlertEventType, string> = {
  smart_error:          'SMART failure',
  smart_attribute:      'SMART attribute',
  temperature:          'Temperature',
  temperature_recovery: 'Temperature recovered',
  drive_missing:        'Drive missing',
  drive_returned:       'Drive returned',
  benchmark_complete:   'Benchmark report',
};

const STATUS: Record<AlertDeliveryStatus, { label: string; className: string }> = {
  sent:    { label: 'sent',     className: 'text-brand' },
  pending: { label: 'retrying', className: 'text-warn' },
  failed:  { label: 'failed',   className: 'text-danger' },
};

function DeliveryList({ entry }: { entry: AlertHistoryEntry }) {
  if (entry.deliveries.length === 0) {
    return <span className="text-xs text-gray-500">no channels subscribed</span>;
  }
  return (
    <ul className="space-y-0.5">
      {entry.deliveries.map(d => {
        const s = STATUS[d.status];
        return (
          <li key={d.channelId} className="text-xs whitespace-nowrap" title={d.lastError ?? undefined}>
            <span className="text-gray-300">{d.channelName}</span>
            <span className="text-gray-500"> · </span>
            <span className={s.className}>
              {s.label}{d.status !== 'sent' && d.attempts > 0 ? ` (${d.attempts})` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertHistoryCard() {
  const { data, isLoading, isError } = useAlertHistory(50);

  return (
    <section className="mt-10" aria-labelledby="alert-history-heading">
      <h2 id="alert-history-heading" className="text-xl font-bold text-white">Recent alerts</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Every alert that fired, with the delivery state per channel. A failed delivery is retried with
        increasing delays for up to about seven hours before it is given up.
      </p>

      {isLoading ? (
        <p className="text-gray-500 text-center py-10">Loading…</p>
      ) : isError ? (
        <p className="text-danger text-sm">Could not load the alert history.</p>
      ) : !data || data.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-400">No alerts yet.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-surface-300">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Drive</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {data.map(entry => (
                <tr key={entry.id} className="border-b border-surface-300/60 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-400 tabular-nums">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-white">{TYPE_LABEL[entry.type]}</td>
                  <td className="px-4 py-3">
                    <div className="text-gray-200">{entry.driveModel || 'Unknown drive'}</div>
                    <div className="text-xs text-gray-500 font-mono">{entry.driveSerial}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 min-w-[16rem]">{entry.message}</td>
                  <td className="px-4 py-3"><DeliveryList entry={entry} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

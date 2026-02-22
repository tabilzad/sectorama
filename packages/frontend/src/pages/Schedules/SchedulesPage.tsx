import { useState } from 'react';
import { useDisks } from '../../api/hooks/useDisks';
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from '../../api/hooks/useSchedules';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';

export default function SchedulesPage() {
  const { data: schedules, isLoading, isError, refetch } = useSchedules();
  const { data: disks } = useDisks();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const [newCron, setNewCron]         = useState('0 2 * * *');
  const [newDriveId, setNewDriveId]   = useState<number | ''>('');
  const [newNumPoints, setNewNumPoints] = useState(11);

  if (isLoading) return <FullPageSpinner />;
  if (isError)   return <ErrorMessage message="Could not load schedules." retry={refetch} />;

  async function handleCreate() {
    await createSchedule.mutateAsync({
      driveId:        newDriveId !== '' ? newDriveId : undefined,
      cronExpression: newCron,
      numPoints:      newNumPoints,
    });
    setNewCron('0 2 * * *');
    setNewDriveId('');
    setNewNumPoints(11);
  }

  function driveLabel(driveId: number | null): string {
    if (!driveId) return 'All drives';
    const d = disks?.find(d => d.driveId === driveId);
    return d ? `${d.vendor} ${d.model} (${d.devicePath})` : `Drive #${driveId}`;
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Benchmark Schedules</h1>

      {/* Add schedule form */}
      <div className="card mb-8">
        <h2 className="text-base font-semibold text-white mb-4">New Schedule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Drive (optional)</label>
            <select
              value={newDriveId}
              onChange={e => setNewDriveId(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                         text-sm text-gray-200 focus:outline-none focus:border-accent"
            >
              <option value="">All drives</option>
              {(disks ?? []).map(d => (
                <option key={d.driveId} value={d.driveId}>
                  {d.vendor} {d.model}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cron Expression</label>
            <input
              type="text"
              value={newCron}
              onChange={e => setNewCron(e.target.value)}
              placeholder="0 2 * * *"
              className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                         text-sm text-gray-200 font-mono focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Points</label>
            <input
              type="number"
              value={newNumPoints}
              min={2}
              max={100}
              onChange={e => setNewNumPoints(parseInt(e.target.value, 10))}
              className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                         text-sm text-gray-200 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={createSchedule.isPending || !newCron}
              className="w-full btn-primary disabled:opacity-50"
            >
              {createSchedule.isPending ? 'Adding…' : 'Add Schedule'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Cron format: minute hour day-of-month month day-of-week · Example: <span className="font-mono">0 2 * * *</span> = daily at 2 AM
        </p>
      </div>

      {/* Schedules table */}
      {!schedules?.length ? (
        <p className="text-gray-500 text-center py-12">No schedules configured yet.</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-300">
                {['Drive', 'Cron', 'Points', 'Enabled', 'Last Run', 'Next Run', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id} className="border-b border-surface-300/50 hover:bg-surface-200">
                  <td className="px-4 py-3 text-gray-300">{driveLabel(s.driveId)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-200">{s.cronExpression}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-400">{s.numPoints}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateSchedule.mutate({ id: s.id, enabled: !s.enabled })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        s.enabled ? 'bg-accent' : 'bg-surface-300'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        s.enabled ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.lastRun ? new Date(s.lastRun).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.nextRun ? new Date(s.nextRun).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteSchedule.mutate(s.id)}
                      disabled={deleteSchedule.isPending}
                      className="text-xs text-danger hover:text-danger/80 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

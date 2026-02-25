import { useState } from 'react';
import { useSchedules, useCreateSchedule, useDeleteSchedule } from '@/api/hooks/useSchedules.ts';

export function DriveSchedules({ driveId }: { driveId: number }) {
  const { data: allSchedules } = useSchedules();
  const createSchedule = useCreateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const [cron, setCron] = useState('0 2 * * *');

  const mySchedules = (allSchedules ?? []).filter(s => s.driveId === driveId);

  async function handleAdd() {
    await createSchedule.mutateAsync({ driveId, cronExpression: cron });
    setCron('0 2 * * *');
  }

  return (
    <div>
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-white mb-3">Add Schedule</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={cron}
            onChange={e => setCron(e.target.value)}
            placeholder="cron expression e.g. 0 2 * * *"
            className="flex-1 bg-surface-100 border border-surface-300 rounded-lg px-3 py-1.5
                       text-sm text-gray-200 placeholder-gray-600 font-mono
                       focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleAdd}
            disabled={createSchedule.isPending || !cron}
            className="btn-primary disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">Standard 5-field cron format: minute hour day month weekday</p>
      </div>

      <div className="space-y-2">
        {mySchedules.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No schedules for this drive.</p>
        ) : mySchedules.map(s => (
          <div key={s.id} className="card flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-mono text-gray-200">{s.cronExpression}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Last: {s.lastRun ? new Date(s.lastRun).toLocaleString() : 'never'}
                {s.nextRun && ` · Next: ${new Date(s.nextRun).toLocaleString()}`}
              </p>
            </div>
            <button
              onClick={() => deleteSchedule.mutate(s.id)}
              className="text-xs text-danger hover:text-danger/80 transition-colors"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

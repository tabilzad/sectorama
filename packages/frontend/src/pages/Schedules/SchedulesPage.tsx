import { useState } from 'react';
import { useDisks } from '@/api/hooks/useDisks.ts';
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from '@/api/hooks/useSchedules.ts';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { FormInput } from '../../components/ui/FormInput';
import { FormSelect } from '../../components/ui/FormSelect';
import { ScheduleFrequencyPicker } from '../../components/schedules/ScheduleFrequencyPicker';
import {
  DEFAULT_SCHEDULE,
  scheduleToCron,
  cronToStructured,
  describeSchedule,
  type StructuredSchedule,
} from '../../utils/scheduleParser';

export default function SchedulesPage() {
  const { data: schedules, isLoading, isError, refetch } = useSchedules();
  const { data: disks } = useDisks();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const [newSchedule, setNewSchedule] = useState<StructuredSchedule>(DEFAULT_SCHEDULE);
  const [newLabel, setNewLabel]         = useState('');
  const [newDriveId, setNewDriveId]     = useState<number | ''>('');
  const [newNumPoints, setNewNumPoints] = useState(11);

  if (isLoading) return <FullPageSpinner />;
  if (isError)   return <ErrorMessage message="Could not load schedules." retry={refetch} />;

  async function handleCreate() {
    await createSchedule.mutateAsync({
      driveId:        newDriveId !== '' ? newDriveId : undefined,
      cronExpression: scheduleToCron(newSchedule),
      numPoints:      newNumPoints,
      label:          newLabel.trim() || undefined,
    });
    setNewSchedule(DEFAULT_SCHEDULE);
    setNewLabel('');
    setNewDriveId('');
    setNewNumPoints(11);
  }

  function driveLabel(driveId: number | null): string {
    if (!driveId) return 'All drives';
    const d = disks?.find(d => d.driveId === driveId);
    return d ? `${d.vendor} ${d.model} (${d.devicePath})` : `Drive #${driveId}`;
  }

  function scheduleDescription(cronExpression: string): string {
    const structured = cronToStructured(cronExpression);
    return structured ? describeSchedule(structured) : cronExpression;
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Benchmark Schedules</h1>

      {/* Add schedule form */}
      <div className="card mb-8">
        <h2 className="text-base font-semibold text-white mb-4">New Schedule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <FormInput
            label="Name (optional)"
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="e.g. Weekend scan"
            className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                       text-sm text-gray-200 focus:outline-none focus:border-accent"
          />
          <FormSelect
            label="Drive (optional)"
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
          </FormSelect>
        </div>

        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1.5">Schedule</p>
          <ScheduleFrequencyPicker value={newSchedule} onChange={setNewSchedule} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <FormInput
            label="Points"
            type="number"
            value={newNumPoints}
            min={2}
            max={100}
            onChange={e => setNewNumPoints(parseInt(e.target.value, 10))}
            className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                       text-sm text-gray-200 focus:outline-none focus:border-accent"
          />

          <div className="sm:col-span-3 flex items-end">
            <button
              onClick={handleCreate}
              disabled={createSchedule.isPending}
              className="w-full sm:w-auto btn-primary disabled:opacity-50"
            >
              {createSchedule.isPending ? 'Adding…' : 'Add Schedule'}
            </button>
          </div>
        </div>
      </div>

      {/* Schedules table */}
      {!schedules?.length ? (
        <p className="text-gray-500 text-center py-12">No schedules configured yet.</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-300">
                {['Drive', 'Schedule', 'Points', 'Enabled', 'Last Run', 'Next Run', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id} className="border-b border-surface-300/50 hover:bg-surface-200">
                  <td className="px-4 py-3 text-gray-300">
                    {s.label && (
                      <em className="block text-xs text-gray-500 not-italic font-medium mb-0.5">{s.label}</em>
                    )}
                    {driveLabel(s.driveId)}
                  </td>
                  <td className="px-4 py-3 text-gray-200 text-xs">{scheduleDescription(s.cronExpression)}</td>
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

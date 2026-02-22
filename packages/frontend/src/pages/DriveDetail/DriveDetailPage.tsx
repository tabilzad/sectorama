import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDrive } from '../../api/hooks/useDisks';
import { useSmartData } from '../../api/hooks/useSmart';
import { useDriveBenchmarks, useDriveBenchmarkSeries, useBenchmarkRun, useRunBenchmark, useBenchmarkProgress, useDeleteBenchmarkRun, usePurgeBenchmarks } from '../../api/hooks/useBenchmarks';
import { useSchedules, useCreateSchedule, useDeleteSchedule } from '../../api/hooks/useSchedules';
import HealthBadge from '../../components/ui/HealthBadge';
import SpeedCurveChart from '../../components/charts/SpeedCurveChart';
import ProfileResultsPanel from '../../components/charts/ProfileResultsPanel';
import BenchmarkProgressBar from '../../components/ui/BenchmarkProgressBar';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { formatBytes } from '../../lib/formatBytes';
import type { SmartAttribute } from '@sectorama/shared';

type Tab = 'smart' | 'benchmarks' | 'schedules';

export default function DriveDetailPage() {
  const { driveId: driveIdStr } = useParams<{ driveId: string }>();
  const driveId = driveIdStr ? parseInt(driveIdStr, 10) : null;
  const [activeTab, setActiveTab] = useState<Tab>('smart');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const { data: drive, isLoading, isError, refetch } = useDrive(driveId);
  const { data: smart } = useSmartData(driveId);
  const { data: runs } = useDriveBenchmarks(driveId);
  const { data: allSeries } = useDriveBenchmarkSeries(driveId);
  const { data: runDetail } = useBenchmarkRun(driveId, selectedRunId);
  const runBenchmark    = useRunBenchmark(driveId);
  const deleteRun       = useDeleteBenchmarkRun(driveId);
  const purgeAll        = usePurgeBenchmarks(driveId);
  const benchmarkProgress = useBenchmarkProgress(selectedRunId);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !drive) return <ErrorMessage message="Drive not found." retry={refetch} />;

  const health: 'ok' | 'warning' | 'failed' | 'unknown' =
    smart?.healthPassed === false ? 'failed'
    : smart?.healthPassed === true  ? 'ok'
    : 'unknown';

  async function handleRunBenchmark() {
    const result = await runBenchmark.mutateAsync(undefined);
    setSelectedRunId(result.runId);
  }

  async function handleDeleteRun(runId: number) {
    if (!window.confirm(`Delete run #${runId} and its data from InfluxDB?`)) return;
    await deleteRun.mutateAsync(runId);
    if (selectedRunId === runId) setSelectedRunId(null);
  }

  async function handlePurgeAll() {
    const count = runs?.length ?? 0;
    if (!window.confirm(`Permanently delete all ${count} benchmark run${count !== 1 ? 's' : ''} and their InfluxDB data for this drive? This cannot be undone.`)) return;
    await purgeAll.mutateAsync(undefined);
    setSelectedRunId(null);
  }

  const activeRun = runs?.find(r => r.status === 'running' || r.status === 'pending');
  const progressRun = runDetail?.status === 'running' || runDetail?.status === 'pending' ? runDetail : null;

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
        <Link to="/" className="hover:text-gray-300">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-300">{drive.vendor} {drive.model}</span>
      </nav>

      {/* Drive header */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{drive.vendor} {drive.model}</h1>
              <HealthBadge health={health} />
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1 text-sm mt-3">
              {[
                ['Device',      drive.devicePath],
                ['Serial',      drive.serialNumber],
                ['Firmware',    drive.firmwareRevision],
                ['Type',        drive.type],
                ['Capacity',    formatBytes(drive.capacity)],
                ['Interface',   drive.interfaceType ?? '—'],
                ['Sector Size', `${drive.logicalSectorSize ?? '?'} / ${drive.physicalSectorSize ?? '?'} B`],
                ['RPM',         drive.rpm ? String(drive.rpm) : (drive.type === 'HDD' ? 'N/A' : '—')],
                ['Status',      drive.isConnected ? 'Connected' : 'Disconnected'],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-gray-500 shrink-0">{label}:</dt>
                  <dd className="text-gray-200 font-mono text-xs self-center">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b border-surface-300">
        {(['smart', 'benchmarks', 'schedules'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
              activeTab === tab
                ? 'border-accent text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'smart' ? 'SMART' : tab === 'benchmarks' ? 'Benchmarks' : 'Schedules'}
          </button>
        ))}
      </div>

      {/* ── SMART tab ──────────────────────────────────────────────────── */}
      {activeTab === 'smart' && (
        <div>
          {!smart ? (
            <p className="text-gray-500 text-center py-12">No SMART data available yet.</p>
          ) : (
            <>
              {/* Key metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Temperature',          value: smart.temperature != null ? `${smart.temperature}°C` : '—' },
                  { label: 'Power-On Hours',        value: smart.powerOnHours?.toLocaleString() ?? '—' },
                  { label: 'Power Cycle Count',     value: smart.powerCycleCount?.toLocaleString() ?? '—' },
                  { label: 'Reallocated Sectors',   value: smart.reallocatedSectors?.toLocaleString() ?? '—' },
                  { label: 'Pending Sectors',       value: smart.pendingSectors?.toLocaleString() ?? '—' },
                  { label: 'Uncorrectable Errors',  value: smart.uncorrectableErrors?.toLocaleString() ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="card">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="text-xl font-bold text-white tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* Attribute table */}
              {smart.attributes.length > 0 && (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-300">
                        {['ID', 'Attribute', 'Value', 'Worst', 'Threshold', 'Raw', 'Status'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {smart.attributes.map((attr: SmartAttribute) => (
                        <tr key={attr.attrId} className={`border-b border-surface-300/50 hover:bg-surface-200 ${attr.failing ? 'bg-danger/5' : ''}`}>
                          <td className="px-4 py-2 text-gray-500 font-mono text-xs">{attr.attrId}</td>
                          <td className="px-4 py-2 text-gray-300">{attr.name}</td>
                          <td className="px-4 py-2 tabular-nums text-gray-200">{attr.value}</td>
                          <td className="px-4 py-2 tabular-nums text-gray-400">{attr.worst}</td>
                          <td className="px-4 py-2 tabular-nums text-gray-400">{attr.threshold}</td>
                          <td className="px-4 py-2 tabular-nums text-gray-500 font-mono text-xs">{attr.rawValue}</td>
                          <td className="px-4 py-2">
                            {attr.failing ? (
                              <span className="text-danger text-xs font-medium">FAILING</span>
                            ) : (
                              <span className="text-brand text-xs">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Benchmarks tab ─────────────────────────────────────────────── */}
      {activeTab === 'benchmarks' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400 text-sm">
              {runs?.length ?? 0} benchmark run{(runs?.length ?? 0) !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              {(runs?.length ?? 0) > 0 && !activeRun && (
                <button
                  onClick={handlePurgeAll}
                  disabled={purgeAll.isPending}
                  className="text-xs text-danger hover:text-danger/80 border border-danger/30 hover:border-danger/60 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {purgeAll.isPending ? 'Purging…' : 'Purge All'}
                </button>
              )}
              <button
                onClick={handleRunBenchmark}
                disabled={runBenchmark.isPending || !!activeRun}
                className="btn-primary disabled:opacity-50"
              >
                {runBenchmark.isPending || activeRun ? 'Running…' : 'Run Benchmark'}
              </button>
            </div>
          </div>

          {/* Progress bar for active run */}
          {progressRun && (
            <div className="card mb-4">
              <BenchmarkProgressBar
                pointIndex={benchmarkProgress?.pointIndex ?? 0}
                totalPoints={benchmarkProgress?.totalPoints ?? progressRun.numPoints}
                speedBps={benchmarkProgress?.speedBps ?? 0}
                phase={benchmarkProgress?.phase}
                phaseLabel={benchmarkProgress?.phaseLabel}
              />
            </div>
          )}

          {/* Run list */}
          <div className="space-y-2">
            {(runs ?? []).map(run => (
              <div
                key={run.runId}
                className={`card flex items-center gap-4 hover:border-accent/40 transition-colors ${
                  selectedRunId === run.runId ? 'border-accent/60' : ''
                }`}
              >
                {/* Clickable area — select / deselect */}
                <button
                  onClick={() => setSelectedRunId(run.runId === selectedRunId ? null : run.runId)}
                  className="flex-1 text-left flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-200">
                      Run #{run.runId} · {run.triggerType}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(run.startedAt).toLocaleString()}
                      {run.completedAt && ` · ${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    run.status === 'completed' ? 'bg-brand/20 text-brand'
                    : run.status === 'running'  ? 'bg-accent/20 text-accent animate-pulse'
                    : run.status === 'failed'   ? 'bg-danger/20 text-danger'
                    : 'bg-surface-300 text-gray-500'
                  }`}>
                    {run.status}
                  </span>
                </button>

                {/* Delete button — hidden for active runs */}
                {run.status !== 'running' && run.status !== 'pending' && (
                  <button
                    onClick={() => handleDeleteRun(run.runId)}
                    disabled={deleteRun.isPending}
                    title="Delete this run"
                    className="shrink-0 text-gray-600 hover:text-danger transition-colors disabled:opacity-40 p-1"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Speed curve — all completed runs overlaid */}
          {allSeries && allSeries.length > 0 && (
            <div className="card mt-6">
              <h3 className="text-sm font-semibold text-white mb-4">
                Speed Curve
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {allSeries.length} run{allSeries.length !== 1 ? 's' : ''} overlaid
                </span>
              </h3>
              <SpeedCurveChart series={allSeries} />
            </div>
          )}

          {/* fio profile results for the selected run */}
          {runDetail?.profileResults && runDetail.profileResults.length > 0 && (
            <div className="card mt-4">
              <ProfileResultsPanel results={runDetail.profileResults} />
            </div>
          )}
        </div>
      )}

      {/* ── Schedules tab ──────────────────────────────────────────────── */}
      {activeTab === 'schedules' && (
        <DriveSchedules driveId={drive.driveId} />
      )}
    </div>
  );
}

// ── Drive-specific schedules sub-component ────────────────────────────────────

function DriveSchedules({ driveId }: { driveId: number }) {
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

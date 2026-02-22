import { useStats } from '../../api/hooks/useStats';
import { useDisks, useScanDisks } from '../../api/hooks/useDisks';
import StatCard from '../../components/ui/StatCard';
import DriveCard from '../../components/ui/DriveCard';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';
import type { DriveSummary } from '@sectorama/shared';

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useStats();
  const { data: disks, isLoading: disksLoading } = useDisks();
  const scanMutation = useScanDisks();

  if (statsLoading || disksLoading) return <FullPageSpinner />;
  if (statsError) return <ErrorMessage message="Could not load dashboard." retry={refetchStats} />;

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          {stats?.lastScanTime && (
            <p className="text-gray-500 text-sm mt-1">
              Last scan: {new Date(stats.lastScanTime).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={() => scanMutation.mutateAsync()}
          disabled={scanMutation.isPending}
          className="btn-primary disabled:opacity-50"
        >
          {scanMutation.isPending ? 'Scanning…' : 'Scan for Drives'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <StatCard label="Total Drives"    value={stats?.totalDrives        ?? 0} />
        <StatCard label="Connected"       value={stats?.connectedDrives    ?? 0} accent />
        <StatCard label="Healthy"         value={stats?.healthyDrives      ?? 0} />
        <StatCard label="Warning"         value={stats?.warningDrives      ?? 0} />
        <StatCard label="Failed"          value={stats?.failedDrives       ?? 0} />
        <StatCard label="Benchmark Runs"  value={stats?.totalBenchmarkRuns ?? 0} />
      </div>

      {/* Drive grid */}
      {!disks?.length ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-4">No drives detected yet.</p>
          <button onClick={() => scanMutation.mutateAsync()} className="btn-primary">
            Scan for Drives
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(disks as DriveSummary[]).map(drive => (
            <DriveCard key={drive.driveId} drive={drive} />
          ))}
        </div>
      )}
    </div>
  );
}

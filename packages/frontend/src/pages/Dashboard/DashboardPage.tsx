import { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useStats } from '@/api/hooks/useStats.ts';
import {
  useDisks,
  useScanDisks,
  useUpdateDriveLabel,
  useDashboardLayout,
  useSaveDashboardLayout,
} from '@/api/hooks/useDisks.ts';
import StatCard from '../../components/ui/StatCard';
import DriveCard from '../../components/ui/DriveCard';
import SortableDriveCard from '../../components/ui/SortableDriveCard';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';
import type { DriveSummary, DashboardPreset } from '@sectorama/shared';

// ── Inline icons ──────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useStats();
  const { data: disks, isLoading: disksLoading } = useDisks();
  const { data: layout, isLoading: layoutLoading } = useDashboardLayout();
  const scanMutation = useScanDisks();
  const updateLabel  = useUpdateDriveLabel();
  const saveLayout   = useSaveDashboardLayout();

  const [editMode, setEditMode]         = useState(false);
  const [activePreset, setActivePreset] = useState<DashboardPreset>('custom');
  const [localOrder, setLocalOrder]     = useState<number[] | null>(null);
  const [activeDriveId, setActiveDriveId] = useState<number | null>(null);
  const [editSnapshot, setEditSnapshot] =
    useState<{ order: number[]; preset: DashboardPreset } | null>(null);

  // Seed localOrder once server data arrives (or after Done resets it to null)
  useEffect(() => {
    if (localOrder === null && disks?.length && layout) {
      setActivePreset(layout.preset);
      setLocalOrder((disks as DriveSummary[]).map(d => d.driveId));
    }
  }, [disks, layout, localOrder]);

  // Sensors: pointer (desktop) + touch with 200ms hold delay (mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Derive display order from localOrder
  const orderedDisks = useMemo<DriveSummary[]>(() => {
    if (!disks?.length) return [];
    const typed = disks as DriveSummary[];
    if (!localOrder) return typed;
    return localOrder
      .map(id => typed.find(d => d.driveId === id))
      .filter((d): d is DriveSummary => d !== undefined);
  }, [disks, localOrder]);

  const activeDrive = activeDriveId != null
    ? orderedDisks.find(d => d.driveId === activeDriveId)
    : undefined;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDriveId(null);
    if (!over || active.id === over.id || !localOrder) return;

    const oldIdx = localOrder.indexOf(Number(active.id));
    const newIdx = localOrder.indexOf(Number(over.id));
    if (oldIdx === -1 || newIdx === -1) return;

    const newOrder = arrayMove(localOrder, oldIdx, newIdx);
    setLocalOrder(newOrder);
    setActivePreset('custom');
  }

  function handleEnterEditMode() {
    setEditSnapshot({ order: localOrder!, preset: activePreset });
    setEditMode(true);
  }

  function handleDone() {
    saveLayout.mutate({
      preset: activePreset,
      driveIds: activePreset === 'custom' ? localOrder! : undefined,
    });
    setEditSnapshot(null);
    setEditMode(false);
    // localOrder intentionally kept — it already reflects the user's intended order.
    // Resetting to null here would cause an immediate flash of stale server data
    // before the query invalidation completes.
  }

  function handleCancel() {
    if (editSnapshot) {
      setLocalOrder(editSnapshot.order);
      setActivePreset(editSnapshot.preset);
    }
    setEditSnapshot(null);
    setEditMode(false);
  }

  function handlePresetChange(base: 'custom' | 'capacity' | 'temperature') {
    if (base === 'custom') {
      setActivePreset('custom');
      return;
    }
    // Clicking the active preset toggles direction; clicking a new one defaults to desc
    const descVariant = base as DashboardPreset;
    const ascVariant  = `${base}_asc` as DashboardPreset;
    const newPreset: DashboardPreset =
      activePreset === descVariant ? ascVariant :
      activePreset === ascVariant  ? descVariant :
      descVariant;
    setActivePreset(newPreset);

    const isAsc = newPreset.endsWith('_asc');
    const sorted = [...(disks as DriveSummary[])];
    if (base === 'capacity') {
      sorted.sort((a, b) => isAsc ? a.capacity - b.capacity : b.capacity - a.capacity);
    }
    if (base === 'temperature') {
      sorted.sort((a, b) => {
        if (a.temperature == null) return 1;
        if (b.temperature == null) return -1;
        return isAsc
          ? a.temperature - b.temperature
          : b.temperature - a.temperature;
      });
    }
    setLocalOrder(sorted.map(d => d.driveId));
  }

  if (statsLoading || disksLoading || layoutLoading) return <FullPageSpinner />;
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
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-300 text-gray-400 hover:text-white text-sm transition-colors"
              >
                <XIcon /> <span className="hidden sm:inline">Cancel</span>
              </button>
              <button
                onClick={handleDone}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent bg-accent/10 text-white text-sm transition-colors"
              >
                <CheckIcon /> <span className="hidden sm:inline">Done</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleEnterEditMode}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-300 text-gray-400 hover:text-white hover:border-accent/50 text-sm transition-colors"
            >
              <PencilIcon /> <span className="hidden sm:inline">Edit Layout</span>
            </button>
          )}

          {/* Scan for Drives */}
          <button
            onClick={() => scanMutation.mutateAsync()}
            disabled={scanMutation.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {scanMutation.isPending ? 'Scanning…' : 'Scan for Drives'}
          </button>
        </div>
      </div>

      {/* Preset toolbar — only in edit mode */}
      {editMode && (
        <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-surface-100 border border-surface-300">
          <span className="text-xs text-gray-500 shrink-0">Sort by:</span>
          {(['custom', 'capacity', 'temperature'] as const).map(base => {
            const isActive = activePreset === base || activePreset === `${base}_asc`;
            const isAsc    = activePreset === `${base}_asc`;
            const label =
              base === 'custom'       ? 'Custom' :
              base === 'capacity'     ? `Capacity ${isActive && isAsc ? '▲' : '▼'}` :
              /* temperature */         `Temp ${isActive && isAsc ? '▲' : '▼'}`;
            return (
              <button
                key={base}
                onClick={() => handlePresetChange(base)}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                  isActive
                    ? 'border-accent bg-accent/10 text-white'
                    : 'border-surface-300 text-gray-400 hover:text-white hover:border-accent/50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

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
      {!orderedDisks.length ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-4">No drives detected yet.</p>
          <button onClick={() => scanMutation.mutateAsync()} className="btn-primary">
            Scan for Drives
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={e => setActiveDriveId(Number(e.active.id))}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedDisks.map(d => d.driveId)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {orderedDisks.map(drive => (
                <SortableDriveCard
                  key={drive.driveId}
                  drive={drive}
                  editMode={editMode}
                  onSaveLabel={(id, label) => updateLabel.mutate({ driveId: id, customLabel: label })}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeDrive && <DriveCard drive={activeDrive} />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

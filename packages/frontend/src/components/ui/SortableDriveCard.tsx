import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DriveSummary } from '@sectorama/shared';
import HealthBadge from './HealthBadge';
import { formatBytes } from '../../lib/formatBytes';

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7"  x2="20" y2="7"  />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

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
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

/** Always renders exactly 2 lines so every card's title block is the same height. */
function DriveTitle({ drive }: { drive: DriveSummary }) {
  return (
    <>
      <p className="font-semibold text-white line-clamp-1">
        {drive.customLabel ?? `${drive.vendor} ${drive.model}`}
      </p>
      <p className="text-xs text-gray-400 line-clamp-1">
        {drive.customLabel ? `${drive.vendor} ${drive.model}` : '\u00A0'}
      </p>
    </>
  );
}

function CardStats({ drive }: { drive: DriveSummary }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <p className="text-xs text-gray-500">Type</p>
        <p className="text-sm font-medium text-gray-300">{drive.type}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Capacity</p>
        <p className="text-sm font-medium text-gray-300">{formatBytes(drive.capacity)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Temp</p>
        <p className={`text-sm font-medium ${
          drive.temperature == null ? 'text-gray-500'
          : drive.temperature > 55  ? 'text-danger'
          : drive.temperature > 45  ? 'text-warn'
          : 'text-gray-300'
        }`}>
          {drive.temperature != null ? `${drive.temperature}°C` : '—'}
        </p>
      </div>
    </div>
  );
}

/** Footer shared across both modes: device path on left, health badge on right. */
function CardFooter({ drive }: { drive: DriveSummary }) {
  return (
    <div className="pt-3 border-t border-surface-300 flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500 font-mono truncate">{drive.devicePath}</span>
      <HealthBadge health={drive.health} size="sm" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SortableDriveCardProps {
  drive: DriveSummary;
  editMode: boolean;
  onSaveLabel: (driveId: number, label: string | null) => void;
}

export default function SortableDriveCard({ drive, editMode, onSaveLabel }: SortableDriveCardProps) {
  const [editing, setEditing] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: drive.driveId,
    disabled: !editMode,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editMode) setEditing(false);
  }, [editMode]);

  function handleSave() {
    onSaveLabel(drive.driveId, labelInput.trim() || null);
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  }

  // ── Normal mode: whole card is a link ──────────────────────────────────────

  if (!editMode) {
    return (
      <div ref={setNodeRef} style={style}>
        <Link
          to={`/drives/${drive.driveId}`}
          className={`card flex flex-col gap-3 hover:border-accent/40 transition-colors ${!drive.isConnected ? 'opacity-60' : ''}`}
        >
          <div className="min-w-0">
            <DriveTitle drive={drive} />
          </div>
          <CardStats drive={drive} />
          <CardFooter drive={drive} />
        </Link>
      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card flex flex-col gap-3 select-none ${!drive.isConnected ? 'opacity-60' : ''} ${isDragging ? 'opacity-50 ring-2 ring-accent/40' : ''}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 p-2 rounded text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none min-h-[2.75rem] min-w-[2.75rem] flex items-center justify-center"
          aria-label="Drag to reorder"
          style={{ touchAction: 'none' }}
        >
          <DragHandle />
        </button>

        {/* Title / editor area */}
        {editing ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              ref={inputRef}
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`${drive.vendor} ${drive.model}`}
              className="flex-1 min-w-0 bg-surface-200 border border-accent/50 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleSave}
              className="shrink-0 p-2 rounded text-green-400 hover:bg-green-400/10 transition-colors min-h-[2.75rem] min-w-[2.75rem] flex items-center justify-center"
              aria-label="Save label"
            >
              <CheckIcon />
            </button>
            <button
              onClick={handleCancel}
              className="shrink-0 p-2 rounded text-gray-400 hover:bg-gray-400/10 transition-colors min-h-[2.75rem] min-w-[2.75rem] flex items-center justify-center"
              aria-label="Cancel"
            >
              <XIcon />
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <DriveTitle drive={drive} />
            </div>
            <button
              onClick={() => { setLabelInput(drive.customLabel ?? ''); setEditing(true); }}
              className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors min-h-[2.75rem] min-w-[2.75rem] flex items-center justify-center shrink-0"
              aria-label="Edit label"
            >
              <PencilIcon />
            </button>
          </>
        )}
      </div>

      <CardStats drive={drive} />
      <CardFooter drive={drive} />
    </div>
  );
}

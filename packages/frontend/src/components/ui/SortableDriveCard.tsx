import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DriveSummary } from '@sectorama/shared';
import HealthBadge from './HealthBadge';
import { formatBytes } from '../../lib/formatBytes';

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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

function DriveTitle({ drive, padRight = false }: { drive: DriveSummary; padRight?: boolean }) {
  return (
    <div className={padRight ? 'pr-9' : ''}>
      <p className="font-semibold text-white line-clamp-1">
        {drive.customLabel ?? `${drive.vendor} ${drive.model}`}
      </p>
      <p className="text-xs text-gray-400 line-clamp-1">
        {drive.customLabel ? `${drive.vendor} ${drive.model}` : '\u00A0'}
      </p>
    </div>
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
    disabled: !editMode || editing,
  });

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

  // ── Normal mode ────────────────────────────────────────────────────────────

  if (!editMode) {
    return (
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform) || undefined, transition }}>
        <Link
          to={`/drives/${drive.driveId}`}
          className={`card flex flex-col gap-3 hover:border-accent/40 transition-colors ${!drive.isConnected ? 'opacity-60' : ''}`}
        >
          <DriveTitle drive={drive} />
          <CardStats drive={drive} />
          <CardFooter drive={drive} />
        </Link>
      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  //
  // Two-layer approach to keep the fly-in animation working:
  //
  //  outer div  — setNodeRef + dnd-kit translate transform + listeners
  //               No rotation here so getBoundingClientRect() stays accurate
  //               and the CSS transition on translate works cleanly.
  //
  //  inner .card — visual styling + jiggle rotation (separate CSS property
  //               on a child, so it never conflicts with the outer translate).

  const shouldWiggle = !isDragging && !editing;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform) || undefined, transition, touchAction: 'none' }}
      {...attributes}
      {...listeners}
      className={[
        'select-none outline-none',
        !drive.isConnected ? 'opacity-60' : '',
        isDragging ? 'opacity-40 cursor-grabbing' : editing ? 'cursor-default' : 'cursor-grab',
      ].join(' ')}
    >
      <div className={[
        'card relative flex flex-col gap-3',
        isDragging ? 'ring-2 ring-accent/50' : '',
        shouldWiggle ? 'card-jiggle' : '',
      ].join(' ')}>

        {/* Pencil badge — absolutely positioned, zero layout impact */}
        {!editing && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => { setLabelInput(drive.customLabel ?? ''); setEditing(true); }}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-surface-200 border border-surface-300 text-gray-400 hover:text-white hover:border-accent/50 transition-colors z-10"
            aria-label="Edit label"
          >
            <PencilIcon />
          </button>
        )}

        {/* Title or label editor */}
        {editing ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <input
              ref={inputRef}
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPointerDown={e => e.stopPropagation()}
              placeholder={`${drive.vendor} ${drive.model}`}
              className="flex-1 min-w-0 bg-surface-200 border border-accent/50 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={handleSave}
              className="shrink-0 p-1.5 rounded text-green-400 hover:bg-green-400/10 transition-colors"
              aria-label="Save label"
            >
              <CheckIcon />
            </button>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={handleCancel}
              className="shrink-0 p-1.5 rounded text-gray-400 hover:bg-gray-400/10 transition-colors"
              aria-label="Cancel"
            >
              <XIcon />
            </button>
          </div>
        ) : (
          <DriveTitle drive={drive} padRight />
        )}

        <CardStats drive={drive} />
        <CardFooter drive={drive} />
      </div>
    </div>
  );
}

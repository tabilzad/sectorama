import type { StructuredSchedule, ScheduleFrequency } from '@/utils/scheduleParser';
import { scheduleToCron } from '@/utils/scheduleParser';

interface Props {
  value: StructuredSchedule;
  onChange: (s: StructuredSchedule) => void;
}

const FREQUENCIES: { key: ScheduleFrequency; label: string }[] = [
  { key: 'hourly',   label: 'Hourly'    },
  { key: 'daily',    label: 'Daily'     },
  { key: 'weekly',   label: 'Weekly'    },
  { key: 'monthly',  label: 'Monthly'   },
  { key: 'biannual', label: 'Biannual'  },
  { key: 'yearly',   label: 'Yearly'    },
];

const HOUR_OPTIONS     = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS   = [0, 15, 30, 45];
const INTERVAL_OPTIONS = [1, 2, 3, 4, 6, 8, 12];
const DOW_OPTIONS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];
const DOM_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);
const BIANNUAL_START_OPTIONS = [
  { value: 1, label: 'Jan + Jul' }, { value: 2, label: 'Feb + Aug' },
  { value: 3, label: 'Mar + Sep' }, { value: 4, label: 'Apr + Oct' },
  { value: 5, label: 'May + Nov' }, { value: 6, label: 'Jun + Dec' },
];
const MONTH_OPTIONS = [
  { value: 1,  label: 'January'   }, { value: 2,  label: 'February'  },
  { value: 3,  label: 'March'     }, { value: 4,  label: 'April'     },
  { value: 5,  label: 'May'       }, { value: 6,  label: 'June'      },
  { value: 7,  label: 'July'      }, { value: 8,  label: 'August'    },
  { value: 9,  label: 'September' }, { value: 10, label: 'October'   },
  { value: 11, label: 'November'  }, { value: 12, label: 'December'  },
];

const selectCls = 'bg-surface-100 border border-surface-300 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-accent';

export function ScheduleFrequencyPicker({ value, onChange }: Props) {
  function setFreq(frequency: ScheduleFrequency) {
    onChange({ ...value, frequency });
  }

  function set<K extends keyof StructuredSchedule>(key: K, val: StructuredSchedule[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="space-y-2">
      {/* Row 1: frequency tabs */}
      <div className="flex gap-1 flex-wrap">
        {FREQUENCIES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFreq(key)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              value.frequency === key
                ? 'border-accent/60 bg-accent/10 text-white'
                : 'border-surface-300 text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Row 2: frequency-specific controls */}
      <div className="flex items-center gap-2 flex-wrap text-sm text-gray-300">
        {value.frequency === 'hourly' && (
          <>
            <span>Every</span>
            <select
              value={value.intervalHours}
              onChange={e => set('intervalHours', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {INTERVAL_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>hours</span>
          </>
        )}

        {value.frequency === 'daily' && (
          <>
            <span>Every day at</span>
            <select
              value={value.hour}
              onChange={e => set('hour', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
              ))}
            </select>
            <span>:</span>
            <select
              value={value.minute}
              onChange={e => set('minute', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {MINUTE_OPTIONS.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </>
        )}

        {value.frequency === 'weekly' && (
          <>
            <span>Every</span>
            <select
              value={value.dayOfWeek}
              onChange={e => set('dayOfWeek', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {DOW_OPTIONS.map(({ value: v, label }) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <span>at</span>
            <select
              value={value.hour}
              onChange={e => set('hour', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
              ))}
            </select>
            <span>:</span>
            <select
              value={value.minute}
              onChange={e => set('minute', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {MINUTE_OPTIONS.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </>
        )}

        {value.frequency === 'monthly' && (
          <>
            <span>On the</span>
            <select
              value={value.dayOfMonth}
              onChange={e => set('dayOfMonth', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {DOM_OPTIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span>of each month at</span>
            <select
              value={value.hour}
              onChange={e => set('hour', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
              ))}
            </select>
            <span>:</span>
            <select
              value={value.minute}
              onChange={e => set('minute', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {MINUTE_OPTIONS.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </>
        )}

        {value.frequency === 'biannual' && (
          <>
            <span>On the</span>
            <select
              value={value.dayOfMonth}
              onChange={e => set('dayOfMonth', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {DOM_OPTIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span>of</span>
            <select
              value={value.startMonth}
              onChange={e => set('startMonth', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {BIANNUAL_START_OPTIONS.map(({ value: v, label }) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <span>at</span>
            <select
              value={value.hour}
              onChange={e => set('hour', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
              ))}
            </select>
            <span>:</span>
            <select
              value={value.minute}
              onChange={e => set('minute', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {MINUTE_OPTIONS.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </>
        )}

        {value.frequency === 'yearly' && (
          <>
            <span>On</span>
            <select
              value={value.month}
              onChange={e => set('month', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {MONTH_OPTIONS.map(({ value: v, label }) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <select
              value={value.dayOfMonth}
              onChange={e => set('dayOfMonth', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {DOM_OPTIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span>at</span>
            <select
              value={value.hour}
              onChange={e => set('hour', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
              ))}
            </select>
            <span>:</span>
            <select
              value={value.minute}
              onChange={e => set('minute', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {MINUTE_OPTIONS.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Row 3: cron preview */}
      <p className="text-xs text-gray-600">
        → cron: <span className="font-mono text-gray-500">{scheduleToCron(value)}</span>
      </p>
    </div>
  );
}

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'biannual' | 'yearly';

export interface StructuredSchedule {
  frequency: ScheduleFrequency;
  intervalHours: number;  // hourly: 1,2,3,4,6,8,12
  hour: number;           // daily/weekly/monthly/biannual/yearly: 0-23
  minute: number;         // all: 0,15,30,45
  dayOfWeek: number;      // weekly: 0-6 (Sun=0)
  dayOfMonth: number;     // monthly/biannual/yearly: 1-28
  startMonth: number;     // biannual: 1-6 (the earlier of the two months; paired with startMonth+6)
  month: number;          // yearly: 1-12 (Jan=1)
}

export const DEFAULT_SCHEDULE: StructuredSchedule = {
  frequency: 'daily',
  intervalHours: 4,
  hour: 2,
  minute: 0,
  dayOfWeek: 0,
  dayOfMonth: 1,
  startMonth: 1,
  month: 1,
};

export function scheduleToCron(s: StructuredSchedule): string {
  switch (s.frequency) {
    case 'hourly':
      return s.intervalHours === 1 ? '0 * * * *' : `0 */${s.intervalHours} * * *`;
    case 'daily':
      return `${s.minute} ${s.hour} * * *`;
    case 'weekly':
      return `${s.minute} ${s.hour} * * ${s.dayOfWeek}`;
    case 'monthly':
      return `${s.minute} ${s.hour} ${s.dayOfMonth} * *`;
    case 'biannual':
      return `${s.minute} ${s.hour} ${s.dayOfMonth} ${s.startMonth},${s.startMonth + 6} *`;
    case 'yearly':
      return `${s.minute} ${s.hour} ${s.dayOfMonth} ${s.month} *`;
  }
}

export function cronToStructured(cron: string): StructuredSchedule | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hr, dom, mon, dow] = parts;

  // hourly: `0 * * * *` or `0 */N * * *`
  if (mon === '*' && dom === '*' && dow === '*') {
    if (hr === '*' && min === '0') {
      return { ...DEFAULT_SCHEDULE, frequency: 'hourly', intervalHours: 1 };
    }
    const hourlyMatch = hr.match(/^\*\/(\d+)$/);
    if (hourlyMatch && min === '0') {
      return { ...DEFAULT_SCHEDULE, frequency: 'hourly', intervalHours: parseInt(hourlyMatch[1], 10) };
    }
    // daily: `M H * * *`
    const hNum = parseInt(hr, 10);
    const mNum = parseInt(min, 10);
    if (!isNaN(hNum) && !isNaN(mNum)) {
      return { ...DEFAULT_SCHEDULE, frequency: 'daily', hour: hNum, minute: mNum };
    }
  }

  // weekly: `M H * * DOW`
  if (mon === '*' && dom === '*') {
    const hNum   = parseInt(hr, 10);
    const mNum   = parseInt(min, 10);
    const dowNum = parseInt(dow, 10);
    if (!isNaN(hNum) && !isNaN(mNum) && !isNaN(dowNum) && dowNum >= 0 && dowNum <= 6) {
      return { ...DEFAULT_SCHEDULE, frequency: 'weekly', hour: hNum, minute: mNum, dayOfWeek: dowNum };
    }
  }

  // monthly: `M H DOM * *`
  if (mon === '*' && dow === '*') {
    const hNum   = parseInt(hr, 10);
    const mNum   = parseInt(min, 10);
    const domNum = parseInt(dom, 10);
    if (!isNaN(hNum) && !isNaN(mNum) && !isNaN(domNum) && domNum >= 1 && domNum <= 28) {
      return { ...DEFAULT_SCHEDULE, frequency: 'monthly', hour: hNum, minute: mNum, dayOfMonth: domNum };
    }
  }

  // biannual: `M H DOM M1,M2 *` where M2 = M1+6
  if (dow === '*' && mon.includes(',')) {
    const monParts = mon.split(',');
    if (monParts.length === 2) {
      const m1     = parseInt(monParts[0], 10);
      const m2     = parseInt(monParts[1], 10);
      const hNum   = parseInt(hr, 10);
      const mNum   = parseInt(min, 10);
      const domNum = parseInt(dom, 10);
      if (
        !isNaN(m1) && !isNaN(m2) && m2 - m1 === 6 && m1 >= 1 && m1 <= 6 &&
        !isNaN(hNum) && !isNaN(mNum) && !isNaN(domNum) && domNum >= 1 && domNum <= 28
      ) {
        return { ...DEFAULT_SCHEDULE, frequency: 'biannual', hour: hNum, minute: mNum, dayOfMonth: domNum, startMonth: m1 };
      }
    }
  }

  // yearly: `M H DOM MonthNum *`
  if (dow === '*' && mon !== '*' && !mon.includes(',') && dom !== '*') {
    const hNum   = parseInt(hr, 10);
    const mNum   = parseInt(min, 10);
    const domNum = parseInt(dom, 10);
    const monNum = parseInt(mon, 10);
    if (
      !isNaN(hNum) && !isNaN(mNum) && !isNaN(domNum) && !isNaN(monNum) &&
      monNum >= 1 && monNum <= 12 && domNum >= 1 && domNum <= 28
    ) {
      return { ...DEFAULT_SCHEDULE, frequency: 'yearly', hour: hNum, minute: mNum, dayOfMonth: domNum, month: monNum };
    }
  }

  return null;
}

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

export function describeSchedule(s: StructuredSchedule): string {
  switch (s.frequency) {
    case 'hourly':
      return s.intervalHours === 1 ? 'Every hour' : `Every ${s.intervalHours} hours`;
    case 'daily':
      return `Daily at ${padTime(s.hour, s.minute)}`;
    case 'weekly':
      return `Weekly ${DAY_NAMES[s.dayOfWeek]} ${padTime(s.hour, s.minute)}`;
    case 'monthly':
      return `Monthly ${ordinal(s.dayOfMonth)} ${padTime(s.hour, s.minute)}`;
    case 'biannual': {
      const m2 = s.startMonth + 6;
      return `Biannual ${MONTH_NAMES[s.startMonth - 1]}+${MONTH_NAMES[m2 - 1]}, ${ordinal(s.dayOfMonth)} ${padTime(s.hour, s.minute)}`;
    }
    case 'yearly':
      return `Yearly ${MONTH_NAMES[s.month - 1]} ${ordinal(s.dayOfMonth)} ${padTime(s.hour, s.minute)}`;
  }
}

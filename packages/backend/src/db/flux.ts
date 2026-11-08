import {
  fluxDateTime,
  fluxDuration,
  fluxExpression,
  type FluxParameterLike,
} from '@influxdata/influxdb-client';

// ─── Time bounds ──────────────────────────────────────────────────────────────

/**
 * Accepted forms for a user-supplied Flux time bound:
 *   - a relative duration such as -7d, -24h or -30m
 *   - now()
 *   - an RFC 3339 timestamp such as 2026-01-02T03:04:05Z
 *
 * Exposed as a JSON Schema `pattern` string so routes reject anything else
 * with a 400 before the value gets anywhere near a query.
 */
export const FLUX_TIME_PATTERN =
  '^(-[0-9]{1,6}(ms|s|m|h|d|w|mo|y)|now\\(\\)|' +
  '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2}))$';

const FLUX_TIME_RE = new RegExp(FLUX_TIME_PATTERN);

/**
 * Convert a validated time bound into a Flux parameter. The `flux` template
 * tag inserts the result as a typed literal (duration / time / expression),
 * never as raw query text.
 */
export function fluxTime(value: string): FluxParameterLike {
  if (!FLUX_TIME_RE.test(value)) {
    throw new Error(`Invalid Flux time bound: ${JSON.stringify(value)}`);
  }
  if (value === 'now()')     return fluxExpression('now()');
  if (value.startsWith('-')) return fluxDuration(value);
  return fluxDateTime(value);
}

// ─── Delete predicates ────────────────────────────────────────────────────────

const TAG_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Quote a value for the double-quoted string syntax of the /api/v2/delete predicate. */
function quotePredicateValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) {
    throw new Error('Predicate values must not contain control characters');
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Build an InfluxDB delete predicate from a measurement and exact tag matches,
 * e.g. `_measurement="benchmark_points" AND run_id="7"`. Tag keys are
 * restricted to identifier characters; values are escaped.
 */
export function deletePredicate(measurement: string, tags: Record<string, string>): string {
  const clauses = [`_measurement=${quotePredicateValue(measurement)}`];
  for (const [key, value] of Object.entries(tags)) {
    if (!TAG_KEY_RE.test(key)) {
      throw new Error(`Invalid tag key: ${JSON.stringify(key)}`);
    }
    clauses.push(`${key}=${quotePredicateValue(value)}`);
  }
  return clauses.join(' AND ');
}

import { InfluxDB, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { config } from '../config.js';

let _client: InfluxDB | null = null;
let _writeApi: WriteApi | null = null;
let _queryApi: QueryApi | null = null;

function getClient(): InfluxDB {
  if (!_client) {
    _client = new InfluxDB({ url: config.influx.url, token: config.influx.token });
  }
  return _client;
}

export function getWriteApi(): WriteApi {
  if (!_writeApi) {
    _writeApi = getClient().getWriteApi(config.influx.org, config.influx.bucket, 'ms');
    _writeApi.useDefaultTags({ app: 'sectorama' });
  }
  return _writeApi;
}

export function getQueryApi(): QueryApi {
  if (!_queryApi) {
    _queryApi = getClient().getQueryApi(config.influx.org);
  }
  return _queryApi;
}

/** Flush pending writes */
export async function flushInflux(): Promise<void> {
  if (_writeApi) {
    await _writeApi.flush();
  }
}

/**
 * Delete points from InfluxDB matching a predicate.
 * Uses the InfluxDB 2.x /api/v2/delete REST endpoint (no extra SDK package needed).
 * predicate examples:
 *   '_measurement="benchmark_points" AND run_id="7"'
 *   '_measurement="benchmark_points" AND serial="MOCK-SSD-001"'
 */
export async function deleteInfluxData(predicate: string): Promise<void> {
  const url = `${config.influx.url}/api/v2/delete` +
    `?org=${encodeURIComponent(config.influx.org)}` +
    `&bucket=${encodeURIComponent(config.influx.bucket)}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Token ${config.influx.token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      start:     '1970-01-01T00:00:00Z',
      stop:      '2099-12-31T00:00:00Z',
      predicate,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`InfluxDB delete failed (HTTP ${res.status}): ${text}`);
  }
}

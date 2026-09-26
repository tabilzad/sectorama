// Imported first by every test file so the environment is pinned before
// config.ts reads it. dotenv never overrides variables that are already set,
// so a developer's local .env cannot leak into a test run.
process.env['NODE_ENV']            = 'test';
process.env['SQLITE_PATH']         = ':memory:';
process.env['DISK_DISCOVERY_MOCK'] = 'true';
// Unroutable on purpose: any code path that accidentally reaches InfluxDB
// fails fast instead of hanging the suite.
process.env['INFLUXDB_URL']        = 'http://127.0.0.1:9';
process.env['INFLUXDB_TOKEN']      = 'test-token';

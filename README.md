# Sectorama

**Self-hosted disk benchmark and health monitor.**

Sectorama discovers your drives, runs comprehensive fio benchmarks (position curve + I/O profiles), polls SMART
attributes on a schedule, and surfaces everything through a clean React dashboard — all from a single Docker container
on your own hardware.

[![CI](https://github.com/tabilzad/sectorama/actions/workflows/ci.yml/badge.svg)](https://github.com/tabilzad/sectorama/actions/workflows/ci.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/tabilzad/sectorama)](https://hub.docker.com/r/tabilzad/sectorama)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

---

## Features

- **Drive discovery** — auto-detects all block devices via `smartctl --scan`
- **Position curve** — measures sequential read speed at evenly-spaced byte offsets to visualise the speed falloff from
  outer to inner tracks
- **fio profiles** — three standard benchmark profiles per run:
    - Sequential read (1 MiB blocks, 30 s)
    - 4 K random read (8 parallel jobs, 30 s)
    - Idle latency (P50 / P95 / P99 / P99.9 ns)
- **SMART history** — scheduled polling stored in InfluxDB; attribute trends charted over time
- **Benchmark schedules** — cron-based per-drive or global schedules
- **Live feed** — WebSocket push for real-time benchmark progress and health alerts
- **Dark UI** — React + Tailwind dashboard; fully responsive

---

## Quick Start (Docker Compose)

### 1. Copy the compose file

```bash
curl -O https://raw.githubusercontent.com/tabilzad/sectorama/master/docker-compose.yml
```

### 2. Set required secrets

```bash
export INFLUXDB_TOKEN=change-me-strong-random-secret
# optional — defaults shown
export INFLUXDB_ADMIN_PASSWORD=adminpass
export SMART_POLL_INTERVAL_MINUTES=60
export BENCHMARK_NUM_POINTS=11
```

### 3. Start

```bash
docker compose up -d
```

Open **http://localhost:8888**, click **Scan for Drives**, then run a benchmark from any drive's detail page.

> **Note:** The container runs `privileged` and mounts `/dev` read-only so that `smartctl` and `fio` can access raw
> block devices. Do not expose port 8888 to the public internet.

---

## Development Setup

### Prerequisites

| Tool            | Version                               |
|-----------------|---------------------------------------|
| Node.js         | 22 LTS                                |
| Docker          | 24+ (for InfluxDB sidecar)            |
| `fio`           | any recent (Linux only for real runs) |
| `smartmontools` | any recent (Linux only)               |

### Steps

```bash
# 1. Clone
git clone https://github.com/tabilzad/sectorama.git
cd sectorama

# 2. Install workspace dependencies
npm install

# 3. Start InfluxDB sidecar
docker compose -f docker-compose.dev.yml up -d

# 4. Configure environment
cp .env.example .env
# On Windows/macOS: add DISK_DISCOVERY_MOCK=true to .env

# 5. Run (backend :8888, frontend :5173 with HMR)
npm run dev
```

### Build

```bash
npm run build       # compiles shared → backend → frontend
npm run typecheck   # type-check all workspaces without emitting
```

---

## Environment Variables

| Variable                      | Default                 | Description                                                      |
|-------------------------------|-------------------------|------------------------------------------------------------------|
| `PORT`                        | `8888`                  | HTTP port the backend listens on                                 |
| `SQLITE_PATH`                 | `./sectorama.db`        | Path to the SQLite database file                                 |
| `INFLUXDB_URL`                | `http://localhost:8086` | InfluxDB v2 base URL                                             |
| `INFLUXDB_TOKEN`              | _(required)_            | InfluxDB API token                                               |
| `INFLUXDB_ORG`                | `sectorama`             | InfluxDB organisation                                            |
| `INFLUXDB_BUCKET`             | `sectorama`             | InfluxDB bucket                                                  |
| `INFLUXDB_ADMIN_PASSWORD`     | `adminpass`             | Admin password for the bundled InfluxDB service                  |
| `SMART_POLL_INTERVAL_MINUTES` | `60`                    | SMART polling interval (must divide evenly into 60 if < 60)      |
| `BENCHMARK_NUM_POINTS`        | `11`                    | Number of positions sampled in each position-curve run           |
| `DISK_DISCOVERY_MOCK`         | `false`                 | Return synthetic drives/SMART/benchmark data (Windows/macOS dev) |

---

### Data stores

| Store                         | What lives there                                                           |
|-------------------------------|----------------------------------------------------------------------------|
| **SQLite** (`better-sqlite3`) | Drive registry, benchmark run metadata, schedules, latest SMART cache      |
| **InfluxDB v2**               | SMART attribute history, benchmark speed points, benchmark profile results |

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository and create a branch from `master`
2. Make your changes and verify `npm run build && npm run typecheck` pass
3. Open a pull request — CI will run automatically on the PR

For larger changes, open an issue first to discuss the approach.

---

## License

Released under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0).

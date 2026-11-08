import { ALERT_TYPES, CHANNEL_TYPES, DASHBOARD_PRESETS } from '@sectorama/shared';
import { FLUX_TIME_PATTERN } from '../db/flux.js';

// JSON Schema fragments shared by the route definitions.
//
// Fastify validates params / querystring / body against these before a
// handler runs. With Fastify's default AJV settings that also coerces numeric
// strings to numbers ("12" → 12) and strips properties the schema does not
// declare, so handlers can trust the shape and type of what they receive.

export const positiveInt       = { type: 'integer', minimum: 1 } as const;
export const shortText         = { type: 'string', minLength: 1, maxLength: 100 } as const;
export const nullableShortText = { type: 'string', nullable: true, maxLength: 100 } as const;
export const celsius           = { type: 'integer', minimum: 0, maximum: 150 } as const;
export const nullableCelsius   = { type: 'integer', nullable: true, minimum: 0, maximum: 150 } as const;

/**
 * Position-curve sample count. Every point reads 128–256 MiB from the device,
 * so the cap bounds the total I/O a single request can schedule.
 */
export const numPoints = { type: 'integer', minimum: 1, maximum: 101 } as const;

export const idParams      = { type: 'object', required: ['id'],      properties: { id: positiveInt } } as const;
export const driveIdParams = { type: 'object', required: ['driveId'], properties: { driveId: positiveInt } } as const;
export const runParams     = {
  type: 'object',
  required: ['driveId', 'runId'],
  properties: { driveId: positiveInt, runId: positiveInt },
} as const;

export const alertType       = { type: 'string', enum: [...ALERT_TYPES] } as const;
export const channelType     = { type: 'string', enum: [...CHANNEL_TYPES] } as const;
export const dashboardPreset = { type: 'string', enum: [...DASHBOARD_PRESETS] } as const;

/** A Flux time bound: relative duration, RFC 3339 timestamp, or now(). */
export const fluxTimeBound = { type: 'string', maxLength: 40, pattern: FLUX_TIME_PATTERN } as const;

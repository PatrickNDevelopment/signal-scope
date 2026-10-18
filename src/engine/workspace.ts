/** Versioned workspace (data + saved configurations) and its strict validation. */
import { z } from 'zod';
import { isIsoDate } from './dates';
import { DEFAULT_STUDY, type StudyParams } from './study';
import type { Rule } from './rules';
import { LIMITS, type MarketEvent, type Series } from './types';

export const WORKSPACE_SCHEMA = 'signal-scope.workspace';
export const WORKSPACE_VERSION = 1;

const date = z.string().refine(isIsoDate, 'dates are YYYY-MM-DD');
const provenance = z
  .object({
    source: z.string().min(1).max(120),
    access: z.enum(['public', 'licensed', 'restricted', 'synthetic']),
    retrievedAt: date,
    note: z.string().max(300),
    sample: z.boolean(),
  })
  .strict();

const point = z
  .object({
    date,
    value: z.number().finite().nullable(),
    volume: z.number().int().min(0).nullable(),
  })
  .strict();

const series = z
  .object({
    id: z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,19}$/),
    name: z.string().min(1).max(80),
    kind: z.enum(['price', 'probability']),
    provenance,
    points: z.array(point).min(2).max(LIMITS.points),
  })
  .strict()
  .superRefine((s, ctx) => {
    s.points.forEach((p, i) => {
      if (i > 0 && !((s.points[i - 1] as { date: string }).date < p.date)) {
        ctx.addIssue({
          code: 'custom',
          path: ['points', i, 'date'],
          message: 'dates must be strictly increasing',
        });
      }
      if (p.value !== null && s.kind === 'price' && !(p.value > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['points', i, 'value'],
          message: 'prices must be positive',
        });
      }
      if (p.value !== null && s.kind === 'probability' && !(p.value >= 0 && p.value <= 1)) {
        ctx.addIssue({
          code: 'custom',
          path: ['points', i, 'value'],
          message: 'probabilities are 0 to 1',
        });
      }
    });
  });

const event = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    kind: z.enum(['catalyst', 'disclosure', 'prediction']),
    label: z.string().min(1).max(120),
    symbols: z
      .array(z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,19}$/))
      .min(1)
      .max(8),
    eventDate: date,
    publishedAt: date,
    direction: z.enum(['up', 'down', 'buy', 'sell']).nullable(),
    provenance,
  })
  .strict()
  .refine((e) => e.publishedAt >= e.eventDate, {
    message: 'publishedAt must not be before eventDate',
  })
  .refine((e) => !(e.direction === 'buy' || e.direction === 'sell') || e.kind === 'disclosure', {
    message: 'buy/sell is only for disclosures',
  });

const studyParams = z
  .object({
    estimation: z.number().int().min(20).max(500),
    pre: z.number().int().min(1).max(60),
    post: z.number().int().min(0).max(60),
    kinds: z.array(z.enum(['catalyst', 'disclosure', 'prediction'])).min(1),
    direction: z.enum(['up', 'down', 'buy', 'sell', 'any']).nullable(),
  })
  .strict();

const condition = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('volume_shock'),
      n: z.number().int().min(5).max(250),
      zMin: z.number().finite().min(-10).max(10),
    })
    .strict(),
  z.object({ type: z.literal('rsi_below'), level: z.number().finite().min(0).max(100) }).strict(),
  z.object({ type: z.literal('rsi_above'), level: z.number().finite().min(0).max(100) }).strict(),
  z
    .object({
      type: z.literal('return_below'),
      h: z.number().int().min(1).max(250),
      pct: z.number().finite().min(-100).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('event_recent'),
      kind: z.enum(['catalyst', 'disclosure', 'prediction']),
      direction: z.enum(['up', 'down', 'buy', 'sell', 'any']).nullable(),
      days: z.number().int().min(1).max(250),
    })
    .strict(),
  z
    .object({
      type: z.literal('prob_change'),
      seriesId: z.string(),
      h: z.number().int().min(1).max(250),
      ppMin: z.number().finite().min(-100).max(100),
    })
    .strict(),
]);

const rule = z
  .object({
    name: z.string().min(1).max(80),
    targetId: z.string(),
    conditions: z.array(condition).min(2).max(6),
    horizon: z.number().int().min(1).max(60),
  })
  .strict();

export interface SavedConfig {
  name: string;
  savedAt: string;
  seriesId: string;
  study: StudyParams;
  rule: Rule;
  split: string;
  costBps: number;
}

const savedConfig = z
  .object({
    name: z.string().min(1).max(80),
    savedAt: z.string().max(40),
    seriesId: z.string().max(20),
    study: studyParams,
    rule,
    split: date,
    costBps: z.number().finite().min(0).max(500),
  })
  .strict();

/** Validates one saved configuration (also used for the current, unsaved settings). */
export function parseSavedConfig(value: unknown): SavedConfig | null {
  const r = savedConfig.safeParse(value);
  return r.success ? (r.data as SavedConfig) : null;
}

export interface Workspace {
  schema: typeof WORKSPACE_SCHEMA;
  version: typeof WORKSPACE_VERSION;
  series: Series[];
  events: MarketEvent[];
  configs: SavedConfig[];
}

const workspace = z
  .object({
    schema: z.literal(WORKSPACE_SCHEMA),
    version: z.literal(WORKSPACE_VERSION),
    series: z.array(series).max(LIMITS.series),
    events: z.array(event).max(LIMITS.events),
    configs: z.array(savedConfig).max(50),
  })
  .strict();

export type WorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; errors: string[] };

export function validateWorkspace(value: unknown): WorkspaceResult {
  const r = workspace.safeParse(value);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const w = r.data as Workspace;
  const errors: string[] = [];
  const sids = new Set<string>();
  for (const s of w.series) {
    if (sids.has(s.id)) errors.push(`series ${s.id}: duplicate id`);
    sids.add(s.id);
  }
  const eids = new Set<string>();
  for (const e of w.events) {
    if (eids.has(e.id)) errors.push(`event ${e.id}: duplicate id`);
    eids.add(e.id);
  }
  return errors.length ? { ok: false, errors } : { ok: true, workspace: w };
}

export function parseWorkspaceJson(text: string): WorkspaceResult {
  if (new TextEncoder().encode(text).length > 20_000_000)
    return { ok: false, errors: ['The file is larger than 20 MB.'] };
  try {
    return validateWorkspace(JSON.parse(text));
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
}

export function emptyWorkspace(): Workspace {
  return {
    schema: WORKSPACE_SCHEMA,
    version: WORKSPACE_VERSION,
    series: [],
    events: [],
    configs: [],
  };
}

export const DEFAULTS = { study: DEFAULT_STUDY };

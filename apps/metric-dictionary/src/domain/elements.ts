/**
 * The periodic table of metrics (pure). Every metric is an element:
 * - atomic number: order of creation (oldest is 1), so numbers never change when new metrics arrive;
 * - symbol: two letters derived from the name, unique across the table, assigned in atomic order (older metrics keep
 *   theirs when a newcomer would collide);
 * - group: its domain; finish: its status; freshness: days since it last changed.
 * The layout mimics the classic table: the two biggest groups stand tall at the edges, the others sit lower in the
 * middle (leaving the "valley" where the key lives), and deprecated metrics form a detached series underneath.
 */
import { daysBetween, normKey } from '@x10/shared/lib';

import type { Metric, MetricStatus } from '../model';

/* ------------------------------------------------------------------ symbols */

const STOP = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'per', 'for', 'in', 'on', 'by', 'at', 'vs', 'or', 'with']);

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Words of a name, ASCII letters only; stop words after the first word are dropped ("Time to Hire" → time, hire). */
export function nameWords(name: string): string[] {
  const all = name
    .normalize('NFKD')
    .split(/[\s\-_/.,:;()]+/)
    .map(letters)
    .filter(Boolean);
  return all.filter((w, i) => i === 0 || !STOP.has(w));
}

/**
 * Candidate symbols in order of preference: first letter plus the initial of each later word, then plus each later
 * letter of the first word, then plus any letter of the later words, then plus any letter A–Z.
 */
export function symbolCandidates(name: string): string[] {
  const words = nameWords(name);
  const first = words[0]?.[0] ?? 'x';
  const seconds: string[] = [];
  const push = (c: string | undefined) => {
    if (c && !seconds.includes(c)) seconds.push(c);
  };
  for (const w of words.slice(1)) push(w[0]);
  for (const c of (words[0] ?? '').slice(1)) push(c);
  for (const w of words.slice(1)) for (const c of w.slice(1)) push(c);
  for (const c of 'abcdefghijklmnopqrstuvwxyz') push(c);
  const out = seconds.map((s) => first.toUpperCase() + s);
  // Last resort (more than 26 metrics share a first letter): other first letters.
  for (const f of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') for (const s of 'abcdefghijklmnopqrstuvwxyz') out.push(f + s);
  return out;
}

type Atomic = Pick<Metric, 'id' | 'name' | 'createdAt'>;

/** Oldest first: createdAt, then name, then id, so the order is total and stable. */
export function atomicOrder<M extends Atomic>(metrics: M[]): M[] {
  return [...metrics].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/** Unique two-letter symbols, assigned in atomic order. */
export function assignSymbols<M extends Atomic>(metrics: M[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const m of atomicOrder(metrics)) {
    const sym = symbolCandidates(m.name).find((s) => !taken.has(s)) ?? '??';
    taken.add(sym);
    out.set(m.id, sym);
  }
  return out;
}

/** The symbol a new name would get next to the existing metrics (the Lab preview). */
export function previewSymbol(existing: Atomic[], name: string, exceptId?: string | null): string {
  const taken = new Set(assignSymbols(existing.filter((m) => m.id !== exceptId)).values());
  return symbolCandidates(name.trim() || 'New').find((s) => !taken.has(s)) ?? '??';
}

/* ------------------------------------------------------------------ elements */

export type Freshness = 'fresh' | 'recent' | 'ageing' | 'stale';

export const FRESHNESS: { value: Freshness; label: string; maxDays: number }[] = [
  { value: 'fresh', label: 'Under 2 weeks', maxDays: 14 },
  { value: 'recent', label: 'Under 2 months', maxDays: 60 },
  { value: 'ageing', label: 'Under 4 months', maxDays: 120 },
  { value: 'stale', label: '4 months or more', maxDays: Infinity },
];

export function freshnessOf(ageDays: number): Freshness {
  return (FRESHNESS.find((f) => ageDays < f.maxDays) ?? FRESHNESS[FRESHNESS.length - 1]).value;
}

export interface Element {
  metric: Metric;
  /** Atomic number, 1-based. */
  n: number;
  symbol: string;
  /** Normalised domain key (case and spaces ignored). */
  group: string;
  /** Whole days since the metric last changed. */
  ageDays: number;
  freshness: Freshness;
}

export function toElements(metrics: Metric[], now: Date = new Date()): Element[] {
  const symbols = assignSymbols(metrics);
  return atomicOrder(metrics).map((metric, i) => {
    const ageDays = Math.max(0, daysBetween(metric.updatedAt, now));
    return {
      metric,
      n: i + 1,
      symbol: symbols.get(metric.id) ?? '??',
      group: normKey(metric.domain),
      ageDays,
      freshness: freshnessOf(ageDays),
    };
  });
}

/* ------------------------------------------------------------------ colours */

/** Ramps for groups and owners (the app accent, plum, is kept for focus and chrome). */
export const GROUP_HUES = ['blue', 'teal', 'gold', 'violet', 'coral', 'cyan', 'amber', 'indigo', 'green', 'ember'] as const;
export const OWNER_HUES = ['coral', 'cyan', 'gold', 'indigo', 'green', 'violet', 'teal', 'ember', 'blue', 'amber'] as const;
export type Hue = (typeof GROUP_HUES)[number] | 'gray' | 'red';

export const STATUS_HUE: Record<MetricStatus, Hue> = {
  approved: 'green',
  in_review: 'blue',
  draft: 'gray',
  deprecated: 'amber',
};

export const FRESHNESS_HUE: Record<Freshness, Hue> = {
  fresh: 'green',
  recent: 'teal',
  ageing: 'amber',
  stale: 'ember',
};

/** Domains in name order, each with a stable hue. */
export function groupHues(elements: Pick<Element, 'group' | 'metric'>[]): Map<string, { label: string; hue: Hue; count: number }> {
  const groups = new Map<string, { label: string; count: number }>();
  for (const e of elements) {
    const g = groups.get(e.group);
    if (g) g.count++;
    else groups.set(e.group, { label: e.metric.domain.trim(), count: 1 });
  }
  const keys = [...groups.keys()].sort((a, b) => groups.get(a)!.label.localeCompare(groups.get(b)!.label));
  return new Map(keys.map((k, i) => [k, { ...groups.get(k)!, hue: GROUP_HUES[i % GROUP_HUES.length] }]));
}

/** Owners in name order, each with a stable hue. */
export function ownerHues(elements: Pick<Element, 'metric'>[]): Map<string, { label: string; hue: Hue; count: number }> {
  const owners = new Map<string, { label: string; count: number }>();
  for (const e of elements) {
    const o = owners.get(e.metric.ownerSub);
    if (o) o.count++;
    else owners.set(e.metric.ownerSub, { label: e.metric.ownerName, count: 1 });
  }
  const keys = [...owners.keys()].sort((a, b) => owners.get(a)!.label.localeCompare(owners.get(b)!.label));
  return new Map(keys.map((k, i) => [k, { ...owners.get(k)!, hue: OWNER_HUES[i % OWNER_HUES.length] }]));
}

/* ------------------------------------------------------------------ layout */

export interface Block {
  group: string;
  label: string;
  /** Columns left to right; each column lists its elements top to bottom (columns are bottom-aligned). */
  columns: Element[][];
  /** Tallest column. */
  height: number;
}

export interface TableLayout {
  /** Rows of the tall edge groups. */
  rows: number;
  /** Rows of the middle groups. */
  midRows: number;
  left: Block | null;
  middle: Block[];
  right: Block | null;
  /** Deprecated metrics, in atomic order: the detached series under the table. */
  series: Element[];
  /** Total tile columns (without gaps). */
  columns: number;
  /** Elements in reading order (blocks left to right, columns top to bottom, then the series). */
  order: Element[];
}

/** Rows for N live elements: about square-root scaled, 3 to 7 like the real table's periods. */
export function tableRows(n: number): number {
  return Math.min(7, Math.max(3, Math.round(Math.sqrt(n / 1.2))));
}

function fill(els: Element[], height: number): Element[][] {
  const cols: Element[][] = [];
  for (let i = 0; i < els.length; i += height) cols.push(els.slice(i, i + height));
  return cols;
}

export function tableLayout(elements: Element[]): TableLayout {
  const live = elements.filter((e) => e.metric.status !== 'deprecated');
  const series = elements.filter((e) => e.metric.status === 'deprecated');
  const byGroup = new Map<string, Element[]>();
  for (const e of live) byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e]);
  const groups = [...byGroup.entries()]
    .map(([group, els]) => ({ group, els, label: els[0].metric.domain.trim() }))
    .sort((a, b) => b.els.length - a.els.length || a.label.localeCompare(b.label));
  const rows = Math.min(tableRows(live.length), Math.max(1, groups[0]?.els.length ?? 1));
  const midRows = Math.max(1, Math.ceil(rows / 2));
  const block = (g: (typeof groups)[number], h: number, reverse = false): Block => {
    const columns = fill(g.els, h);
    if (reverse) columns.reverse();
    return { group: g.group, label: g.label, columns, height: Math.max(...columns.map((c) => c.length)) };
  };
  const left = groups[0] ? block(groups[0], rows) : null;
  const right = groups[1] ? block(groups[1], rows, true) : null;
  const middle = groups
    .slice(2)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((g) => block(g, midRows));
  const blocks = [left, ...middle, right].filter((b): b is Block => !!b);
  return {
    rows,
    midRows,
    left,
    middle,
    right,
    series,
    columns: blocks.reduce((n, b) => n + b.columns.length, 0),
    order: [...blocks.flatMap((b) => b.columns.flat()), ...series],
  };
}

/* ------------------------------------------------------------------ today */

export interface TodaySignal {
  id: string;
  metricId: string;
  title: string;
  severity: 'bad' | 'warn' | 'info';
  value: string | number;
  unit: string;
  lens: 'domain' | 'status' | 'owner' | 'freshness';
  meta: string;
}

export interface TodayInput {
  elements: Element[];
  /** Metric ids with an open change request (a draft sent back by a steward). */
  sentBack: Map<string, { reviewerName: string; daysAgo: number }>;
  now: Date;
  role: 'steward' | 'owner';
  me: string;
}

const rank = { bad: 0, warn: 1, info: 2 } as const;

/**
 * The three to five things that need attention, ranked. Stewards see the queue (oldest waiting first), re-reviews,
 * metrics with no measure and the stalest approved metric; owners see their own drafts sent back, waiting reviews,
 * unsubmitted drafts and stale approvals.
 */
export function todaySignals({ elements, sentBack, now, role, me }: TodayInput): TodaySignal[] {
  const out: TodaySignal[] = [];
  const mine = (e: Element) => e.metric.ownerSub === me;
  const pool = role === 'owner' ? elements.filter(mine) : elements;
  const waitDays = (e: Element) => Math.max(0, daysBetween(e.metric.submittedAt ?? e.metric.updatedAt, now));

  const inReview = pool
    .filter((e) => e.metric.status === 'in_review')
    .sort((a, b) => waitDays(b) - waitDays(a));
  for (const e of inReview) {
    const reReview = !!e.metric.approvedVersionId;
    const own = role === 'steward' && mine(e);
    out.push({
      id: `review:${e.metric.id}`,
      metricId: e.metric.id,
      title:
        role === 'owner'
          ? `${e.metric.name} v${e.metric.version} is with the stewards`
          : reReview
            ? `${e.metric.name} v${e.metric.version} would change an approved metric`
            : own
              ? `${e.metric.name} needs another steward`
              : `${e.metric.name} is waiting for review`,
      severity: role === 'steward' && waitDays(e) >= 7 ? 'bad' : 'warn',
      value: waitDays(e),
      unit: waitDays(e) === 1 ? 'day waiting' : 'days waiting',
      lens: 'status',
      meta: `${e.metric.domain} · ${e.metric.ownerName}`,
    });
  }

  for (const e of pool.filter((x) => x.metric.status === 'draft')) {
    const back = sentBack.get(e.metric.id);
    if (back)
      out.push({
        id: `back:${e.metric.id}`,
        metricId: e.metric.id,
        title: `${e.metric.name} was sent back by ${back.reviewerName}`,
        severity: role === 'owner' ? 'bad' : 'info',
        value: back.daysAgo,
        unit: back.daysAgo === 1 ? 'day ago' : 'days ago',
        lens: 'owner',
        meta: e.metric.ownerName,
      });
  }

  for (const e of pool.filter((x) => x.metric.status !== 'deprecated' && !x.metric.measureName)) {
    out.push({
      id: `measure:${e.metric.id}`,
      metricId: e.metric.id,
      title: `${e.metric.name} has no measure yet`,
      severity: 'info',
      value: e.symbol,
      unit: 'no measure',
      lens: 'domain',
      meta: e.metric.domain,
    });
  }

  if (role === 'owner') {
    for (const e of pool.filter((x) => x.metric.status === 'draft' && !sentBack.has(x.metric.id) && x.metric.measureName)) {
      out.push({
        id: `draft:${e.metric.id}`,
        metricId: e.metric.id,
        title: `${e.metric.name} is a draft, not yet submitted`,
        severity: 'info',
        value: e.ageDays,
        unit: e.ageDays === 1 ? 'day old' : 'days old',
        lens: 'status',
        meta: e.metric.domain,
      });
    }
  }

  const stalest = pool
    .filter((e) => e.metric.status === 'approved' && e.freshness === 'stale')
    .sort((a, b) => b.ageDays - a.ageDays)[0];
  if (stalest)
    out.push({
      id: `stale:${stalest.metric.id}`,
      metricId: stalest.metric.id,
      title: `${stalest.metric.name} has not changed in ${stalest.ageDays} days`,
      severity: 'info',
      value: stalest.ageDays,
      unit: 'days unchanged',
      lens: 'freshness',
      meta: `${stalest.metric.domain} · ${stalest.metric.ownerName}`,
    });

  // Stable rank: severity first, then the order above (queue order within a severity).
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank[a.s.severity] - rank[b.s.severity] || a.i - b.i)
    .map((x) => x.s)
    .slice(0, 5);
}

/* ------------------------------------------------------------------ search on the table */

/** Ids of metrics whose replacement points at `id` (the elements that decay into it). */
export function decaysInto(elements: Element[], id: string): Element[] {
  return elements.filter((e) => e.metric.replacedById === id);
}

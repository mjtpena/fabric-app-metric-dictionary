/**
 * Peer review: the stewards' bench. The queue (oldest submission first) sits on the left; the selected element's
 * proposal is on the bench to the right, with tracked changes against its approved isotope for re-reviews.
 * Stewards cannot review metrics they own.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Stamp } from 'lucide-react';

import { AdminOnly, useApp } from '@x10/shared/runtime';
import { daysBetween, formatDateTime, formatRelative, useAsync, usePolling } from '@x10/shared/lib';
import {
  Avatar,
  Button,
  ConfirmDialog,
  cx,
  DataState,
  EmptyState,
  ErrorPanel,
  Skeleton,
  Stat,
  StatStrip,
  Toast,
} from '@x10/shared/ui';

import { Caption, FormulaPanel } from '../components/bits';
import { FINISH, makePalette, SymbolChip } from '../components/element';
import { DiffLegend, ValueChange, WordDiff } from '../components/WordDiff';
import { rules } from '../config';
import { toElements } from '../domain/elements';
import { approveMetric, getMetricDetail, listMetrics, requestChanges, reviewQueue, type QueueRow } from '../domain/metrics';
import { OWN_METRIC_REASON } from '../domain/rules';
import { limits, type Schema } from '../model';

export function ReviewPage() {
  return (
    <AdminOnly>
      <ReviewBench />
    </AdminOnly>
  );
}

function ReviewBench() {
  const app = useApp<Schema>();
  const state = useAsync(async () => {
    const [rows, all] = await Promise.all([reviewQueue(app.store, app.me), listMetrics(app.store)]);
    return { rows, all };
  }, [app.store, app.me.sub]);
  usePolling(state.reload, rules.queuePollMs);
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState<{ row: QueueRow; kind: 'approve' | 'changes' } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  return (
    <>
      <header className="mb-6">
        <p className="x-legend-label m-0 text-[11px] text-muted">Stewards</p>
        <h1 className="x-serif m-0 mt-1 text-[40px] leading-[1.05] tracking-[-0.015em] max-md:text-[32px]">Peer review</h1>
      </header>
      <DataState
        state={state}
        skeleton={<BenchSkeleton />}
        isEmpty={(d) => d.rows.length === 0}
        empty={
          <EmptyState
            icon={<Stamp />}
            title="Nothing waiting for review"
            bordered
            action={
              <Link to="/" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent-9 px-3 text-ui font-medium text-accent-contrast no-underline hover:bg-accent-10">
                Back to the table <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            }
          >
            When an owner submits a metric, it lands here, oldest first.
          </EmptyState>
        }
      >
        {({ rows, all }) => {
          const waited = (r: QueueRow) => Math.max(0, daysBetween(r.metric.submittedAt ?? r.metric.updatedAt, now));
          const reviewable = rows.filter((r) => !r.own);
          const selectedId = params.get('id') && rows.some((r) => r.metric.id === params.get('id')) ? params.get('id')! : (reviewable[0] ?? rows[0]).metric.id;
          const elements = toElements(all);
          const byId = new Map(elements.map((e) => [e.metric.id, e]));
          const palette = makePalette(elements);
          return (
            <>
              <StatStrip className="mb-6" columns={4}>
                <Stat label="Waiting" value={rows.length} />
                <Stat label="Re-reviews" value={rows.filter((r) => r.approvedLabel).length} hint="Change an approved metric" />
                <Stat label="Oldest" value={`${Math.max(...rows.map(waited))}d`} tone={Math.max(...rows.map(waited)) >= 7 ? 'warn' : undefined} />
                <Stat label="Yours" value={rows.filter((r) => r.own).length} hint="Need another steward" />
              </StatStrip>
              <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <section aria-label="Queue">
                  <Caption count={rows.length}>Queue · oldest first</Caption>
                  <ol className="m-0 list-none p-0" data-testid="review-table">
                    {rows.map((row) => {
                      const m = row.metric;
                      const el = byId.get(m.id);
                      const selected = m.id === selectedId;
                      const at = m.submittedAt ?? m.updatedAt;
                      const hue = palette.groups.get(el?.group ?? '')?.hue ?? 'gray';
                      return (
                        <li
                          key={m.id}
                          data-testid="review-row"
                          data-selected={selected || undefined}
                          className={cx(
                            'relative -mx-3 rounded-xl px-3 py-3 transition-colors',
                            selected ? 'bg-[color-mix(in_oklab,var(--accent-9)_8%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent-9)_30%,transparent)]' : 'hover:bg-gray-3',
                          )}
                        >
                          <button
                            type="button"
                            className="absolute inset-0 cursor-pointer rounded-xl"
                            aria-label={`Put ${m.name} on the bench`}
                            aria-pressed={selected}
                            onClick={() => setParams({ id: m.id }, { replace: true })}
                          />
                          <div className="pointer-events-none relative flex items-start gap-3">
                            {el && <SymbolChip symbol={el.symbol} hue={hue} finish={FINISH[m.status]} size={40} />}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <Link to={`/metrics/${m.id}`} className="pointer-events-auto truncate font-semibold text-fg no-underline hover:underline">
                                  {m.name}
                                </Link>
                                <span className={cx('shrink-0 font-mono text-sm num', waited(row) >= 7 ? 'text-warn-text' : 'text-muted')} title={formatDateTime(at)}>
                                  {waited(row)}d
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                                <span>{m.domain}</span>
                                <span aria-hidden="true">·</span>
                                <span>{m.ownerName}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono num">v{m.version}</span>
                                {row.approvedLabel && <span className="text-info-text">Re-review · v{row.approvedLabel} approved</span>}
                              </div>
                              <div className="pointer-events-auto mt-2.5 flex flex-wrap gap-2">
                                {row.own ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn-text" title={OWN_METRIC_REASON}>
                                    <span aria-hidden="true" className="size-1.5 rounded-full bg-warn-solid" />
                                    Yours: another steward reviews
                                  </span>
                                ) : (
                                  <>
                                    <Button size="sm" variant="primary" onClick={() => setPending({ row, kind: 'approve' })} aria-label={`Approve ${m.name}`}>
                                      Approve
                                    </Button>
                                    <Button size="sm" onClick={() => setPending({ row, kind: 'changes' })} aria-label={`Request changes to ${m.name}`}>
                                      Request changes
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
                <Bench key={selectedId} id={selectedId} row={rows.find((r) => r.metric.id === selectedId)!} onApprove={(row) => setPending({ row, kind: 'approve' })} onChanges={(row) => setPending({ row, kind: 'changes' })} />
              </div>
            </>
          );
        }}
      </DataState>

      <ConfirmDialog
        open={pending?.kind === 'approve'}
        onClose={() => setPending(null)}
        title={pending ? `Approve ${pending.row.metric.name} v${pending.row.metric.version}?` : 'Approve'}
        body={<p className="m-0">It becomes the approved definition for everyone, with a solid finish on the table.</p>}
        confirmLabel="Approve"
        noteLabel="Comment (optional)"
        noteMax={limits.reviewComment.max}
        onConfirm={async (note) => {
          const m = pending!.row.metric;
          await approveMetric(app.store, app.me, m.id, note || null);
          await state.reload();
          setToast(`${m.name} v${m.version} approved.`);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'changes'}
        onClose={() => setPending(null)}
        title={pending ? `Request changes to ${pending.row.metric.name}` : 'Request changes'}
        body={<p className="m-0">It goes back to draft with your comment shown at the top.</p>}
        confirmLabel="Request changes"
        noteLabel="What needs to change"
        noteRequired
        noteMax={limits.reviewComment.max}
        onConfirm={async (note) => {
          const m = pending!.row.metric;
          await requestChanges(app.store, app.me, m.id, note);
          await state.reload();
          setToast(`Changes requested on ${m.name}.`);
        }}
      />
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </>
  );
}

/** The proposal on the bench: what the owner wants approved, and what changed since the approved isotope. */
function Bench({ id, row, onApprove, onChanges }: { id: string; row: QueueRow; onApprove: (r: QueueRow) => void; onChanges: (r: QueueRow) => void }) {
  const app = useApp<Schema>();
  const state = useAsync(() => getMetricDetail(app.store, id), [app.store, id]);
  const [mode, setMode] = useState<'changes' | 'full'>('changes');
  useEffect(() => setMode('changes'), [id]);
  if (state.error && !state.data) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;
  if (!state.data)
    return (
      <div className="space-y-3" role="status" aria-label="Loading">
        <Skeleton width="50%" height={36} />
        <Skeleton width="100%" height={80} />
        <Skeleton width="100%" height={56} />
      </div>
    );
  const d = state.data;
  const m = d.metric;
  const base = d.approvedVersion;
  const prev = d.versions[1] ?? null;
  return (
    <section aria-label={`Bench: ${m.name}`} data-testid="review-bench" className="min-w-0">
      <Caption
        action={
          base ? (
            <span className="inline-flex rounded-lg bg-gray-3 p-0.5 text-xs">
              {(['changes', 'full'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={mode === k}
                  onClick={() => setMode(k)}
                  className={cx('cursor-pointer rounded-md px-2 py-1 font-medium', mode === k ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg')}
                >
                  {k === 'changes' ? 'Tracked changes' : 'Full text'}
                </button>
              ))}
            </span>
          ) : undefined
        }
      >
        On the bench
      </Caption>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="x-serif m-0 text-[34px] leading-[1.05] tracking-[-0.01em]">{m.name}</h2>
          <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={m.ownerName} size="xs" />
              {m.ownerName}
            </span>
            <span className="font-mono num">
              {base ? `v${base.version} → ` : ''}v{m.version}
            </span>
            <span>submitted {formatRelative(m.submittedAt ?? m.updatedAt)}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4">
        {base && mode === 'changes' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="x-legend-label text-[10px] text-muted">
                Since approved v{base.version}
              </span>
              <DiffLegend />
            </div>
            <WordDiff label="Definition" before={base.definition} after={m.definition} testId="bench-diff-definition" />
            <WordDiff label="Formula" before={base.formula} after={m.formula} mono />
            <ValueChange label="Measure" before={base.measureName} after={m.measureName} />
          </>
        ) : (
          <>
            <span className="x-legend-label text-[10px] text-muted">Definition</span>
            <p className="m-0 mt-1 text-[15px] leading-6">{m.definition}</p>
            <span className="x-legend-label mt-4 block text-[10px] text-muted">Formula</span>
            <div className="mt-1">
              <FormulaPanel>{m.formula}</FormulaPanel>
            </div>
            <span className="x-legend-label mt-4 block text-[10px] text-muted">Measure</span>
            <p className="m-0 mt-1 font-mono text-sm">{m.measureName ?? 'Not yet implemented'}</p>
            {!base && prev && <p className="m-0 mt-3 text-xs text-muted">{d.versions.length} saved versions; none approved yet.</p>}
          </>
        )}
      </div>

      {d.reviews[0] && (
        <p className="m-0 mt-3 text-xs text-muted">
          Last review: {d.reviews[0].reviewerName}, {d.reviews[0].decision === 'approve' ? 'approved' : 'asked for changes'} on v{d.reviews[0].versionLabel}{' '}
          {formatRelative(d.reviews[0].createdAt)}
          {d.reviews[0].comment ? `: “${d.reviews[0].comment}”` : '.'}
        </p>
      )}

      {!row.own && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" icon={<BadgeCheck aria-hidden="true" />} onClick={() => onApprove(row)}>
            Approve v{m.version}
          </Button>
          <Button onClick={() => onChanges(row)}>Send back with a comment</Button>
          <Link to={`/metrics/${m.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-ui font-medium text-accent-11 no-underline hover:bg-accent-3">
            Element card <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      )}
      {row.own && <p className="m-0 mt-4 text-sm font-medium text-warn-text">{OWN_METRIC_REASON}</p>}
    </section>
  );
}

function BenchSkeleton() {
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 p-4">
            <Skeleton width={60} height={10} />
            <Skeleton width={40} height={22} />
          </div>
        ))}
      </div>
      <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton width={40} height={40} />
              <div className="flex-1 space-y-2">
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={10} />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton width="50%" height={36} />
          <Skeleton width="100%" height={140} />
        </div>
      </div>
    </div>
  );
}

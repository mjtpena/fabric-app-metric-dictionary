/**
 * Export: the approved elements as a printable table poster (A3 landscape), a Markdown table or a CSV.
 * Drafts, metrics in review and deprecated metrics are left out of every format.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, Printer } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { downloadText, formatDate, plural, useAsync } from '@x10/shared/lib';
import { Button, CopyButton, DataState, EmptyState, Skeleton } from '@x10/shared/ui';

import { Caption } from '../components/bits';
import { FINISH, makePalette, StaticTile } from '../components/element';
import { tableGeometry } from '../components/PeriodicTable';
import { tableLayout, toElements, type Element } from '../domain/elements';
import { approvedMetrics, exportFileName, NOT_IMPLEMENTED, toCsvText, toMarkdown } from '../domain/export';
import { listMetrics } from '../domain/metrics';
import type { Metric, Schema } from '../model';

export function ExportPage() {
  const { store } = useApp<Schema>();
  const state = useAsync(() => listMetrics(store), [store]);
  const hasRows = !!state.data && approvedMetrics(state.data).length > 0;
  const print = () => {
    document.body.classList.add('el-printing');
    const done = () => {
      document.body.classList.remove('el-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="x-legend-label m-0 text-[11px] text-muted">Export</p>
          <h1 className="x-serif m-0 mt-1 text-[40px] leading-[1.05] tracking-[-0.015em] max-md:text-[32px]">Approved elements</h1>
          {state.data && (
            <p className="m-0 mt-1.5 text-ui text-muted" data-testid="export-count">
              {plural(approvedMetrics(state.data).length, 'approved metric')}
            </p>
          )}
        </div>
        {hasRows && (
          <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>*]:flex-1">
            <Button icon={<Printer aria-hidden="true" />} onClick={print}>
              Print poster
            </Button>
            <CopyButton size="md" label="Copy as Markdown" text={() => toMarkdown(state.data ?? [], new Date().toISOString())} />
            <Button
              variant="primary"
              icon={<Download aria-hidden="true" />}
              onClick={() => {
                const now = new Date().toISOString();
                downloadText(exportFileName(now), toCsvText(state.data ?? []));
              }}
            >
              Download CSV
            </Button>
          </div>
        )}
      </header>
      <DataState
        state={state}
        skeleton={<Skeleton width="100%" height={420} className="rounded-2xl" />}
        isEmpty={(d) => approvedMetrics(d).length === 0}
        empty={
          <EmptyState
            title="No approved elements yet"
            bordered
            action={
              <Link to="/" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent-9 px-3 text-ui font-medium text-accent-contrast no-underline hover:bg-accent-10">
                Back to the table <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            }
          >
            Elements appear here once a steward approves them.
          </EmptyState>
        }
      >
        {(all) => <Poster all={all} />}
      </DataState>
    </>
  );
}

function Poster({ all }: { all: Metric[] }) {
  const approved = useMemo(() => approvedMetrics(all), [all]);
  const ids = useMemo(() => new Set(approved.map((m) => m.id)), [approved]);
  // Numbers and symbols come from the whole table, so a poster element matches its tile in the app.
  const elements = useMemo(() => toElements(all).filter((e) => ids.has(e.metric.id)), [all, ids]);
  const palette = useMemo(() => makePalette(elements), [elements]);
  const layout = useMemo(() => tableLayout(elements), [elements]);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const g = useMemo(() => tableGeometry(layout, Math.max(240, w), 1200), [layout, w]);
  const today = formatDate(new Date().toISOString());
  const groups = [...palette.groups.entries()];

  return (
    <article className="el-poster overflow-hidden rounded-2xl border border-line bg-[var(--el-paper)] shadow-1" aria-label="Poster: the periodic table of approved metrics" data-testid="poster">
      <div className="px-6 pt-7 pb-6 sm:px-10 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
          <h2 className="x-serif m-0 text-[44px] leading-none tracking-[-0.02em] max-md:text-[32px]">The Periodic Table of Metrics</h2>
          <p className="x-legend-label m-0 text-[10px] text-muted">
            Approved definitions · {today} · {plural(elements.length, 'element')}
          </p>
        </div>

        <div ref={box} className="mt-6 max-md:hidden">
          {w > 0 && (
            <div className="relative mx-auto" style={{ width: g.width, height: g.height }}>
              {g.labels.map((l) => (
                <div key={l.key} className="absolute flex items-end gap-1.5 pb-1.5" style={{ left: l.x, top: l.y, width: l.w, height: 22 }}>
                  <span aria-hidden="true" className="h-[3px] w-3 self-center rounded-full" style={{ background: `var(--${palette.groups.get(l.group)?.hue ?? 'gray'}-9)` }} />
                  <span className="x-legend-label truncate text-[10px] text-muted">{l.label}</span>
                </div>
              ))}
              {layout.order.map((el) => {
                const p = g.pos.get(el.metric.id)!;
                return (
                  <div key={el.metric.id} className="absolute" style={{ left: p.x, top: p.y }}>
                    <StaticTile
                      n={el.n}
                      symbol={el.symbol}
                      name={el.metric.name}
                      corner={el.metric.version}
                      hue={palette.groups.get(el.group)?.hue ?? 'gray'}
                      finish={FINISH[el.metric.status]}
                      size={g.tile}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 max-md:mt-6">
          <Caption>Reference</Caption>
        </div>
        <div className="columns-1 gap-8 md:columns-2 xl:columns-3">
          {groups.map(([key, grp]) => (
            <section key={key} className="mb-6 break-inside-avoid" aria-label={grp.label}>
              <h3 className="x-legend-label m-0 mb-2 flex items-center gap-1.5 text-[10px] font-normal text-muted">
                <span aria-hidden="true" className="h-[3px] w-3 rounded-full" style={{ background: `var(--${grp.hue}-9)` }} />
                {grp.label}
              </h3>
              <dl className="m-0">
                {elements
                  .filter((e) => e.group === key)
                  .map((e) => (
                    <PosterEntry key={e.metric.id} el={e} hue={grp.hue} />
                  ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="m-0 mt-2 border-t border-line pt-3 text-[11px] text-faint">
          Numbers show the order each metric was created; symbols are derived from the name. Exported from Metric Dictionary.
        </p>
      </div>
    </article>
  );
}

function PosterEntry({ el, hue }: { el: Element; hue: Parameters<typeof StaticTile>[0]['hue'] }) {
  const m = el.metric;
  return (
    <div className="mb-3 flex gap-3 break-inside-avoid">
      <StaticTile n={el.n} symbol={el.symbol} name={m.name} hue={hue} finish="solid" size={44} showName={false} corner="" />
      <div className="min-w-0">
        <dt className="text-sm font-semibold leading-5">
          <Link to={`/metrics/${m.id}`} className="text-fg no-underline hover:underline">
            {m.name}
          </Link>{' '}
          <span className="font-mono text-[11px] font-normal text-muted num">v{m.version}</span>
        </dt>
        <dd className="m-0 text-[13px] leading-[19px] text-muted">{m.definition}</dd>
        <dd className="m-0 mt-0.5 truncate font-mono text-[11px] text-muted">{m.measureName ?? NOT_IMPLEMENTED} · {m.ownerName}</dd>
      </div>
    </div>
  );
}

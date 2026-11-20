/**
 * Home: the periodic table of metrics. Lenses re-colour the same table (domain, status, owner, freshness), the
 * finish always shows status, Today focuses the element behind each item, view-as switches between the steward's
 * and the owner's perspective, and the list view carries the same data for screen readers and printing.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Atom, CloudOff, FlaskConical, Keyboard, Plus, RotateCw } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { plural, useAsync } from '@x10/shared/lib';
import {
  Button,
  IconButton,
  Legend,
  LensBar,
  StageMessage,
  StagePage,
  supportsWebGL,
  TodayPanel,
  useHotkeys,
  useIsDesktop,
  useReducedMotion,
  ViewAsSwitch,
  ViewToggle,
  type LegendItem,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { FINISH, FinishSwatch, makePalette, type Lens, type Palette } from '../components/element';
import { DesktopTable, PhoneTable } from '../components/PeriodicTable';
import { ShortcutSheet } from '../components/Shortcuts';
import { ElementList, ElementPeek, FindBox } from '../components/TableParts';
import {
  FRESHNESS,
  FRESHNESS_HUE,
  STATUS_HUE,
  tableLayout,
  todaySignals,
  toElements,
  type Element,
} from '../domain/elements';
import { statusMeta } from '../domain/rules';
import { searchMetrics } from '../domain/search';
import { loadTable, type TableData } from '../domain/table';
import { METRIC_STATUSES, type Schema } from '../model';

const LENSES: { value: Lens; label: string; swatch: string; description: string }[] = [
  {
    value: 'domain',
    label: 'Domain',
    swatch: 'conic-gradient(var(--blue-9) 0 25%, var(--teal-9) 0 50%, var(--gold-9) 0 75%, var(--violet-9) 0)',
    description: 'Colour by group (business domain)',
  },
  { value: 'status', label: 'Status', swatch: 'var(--green-9)', description: 'Colour by status' },
  {
    value: 'owner',
    label: 'Owner',
    swatch: 'conic-gradient(var(--coral-9) 0 33%, var(--cyan-9) 0 66%, var(--gold-9) 0)',
    description: 'Colour by owner',
  },
  { value: 'freshness', label: 'Freshness', swatch: 'linear-gradient(90deg, var(--green-9), var(--amber-9), var(--ember-9))', description: 'Days since the last change' },
];
const LENS_KEYS = LENSES.map((l) => l.value);

type ViewAs = 'steward' | 'owner';

function legendFor(lens: Lens, elements: Element[], palette: Palette): LegendItem[] {
  const count = (f: (e: Element) => boolean) => elements.filter(f).length;
  if (lens === 'status')
    return METRIC_STATUSES.map((s) => ({
      label: statusMeta[s].label,
      icon: <FinishSwatch finish={FINISH[s]} hue={STATUS_HUE[s]} size={12} />,
      value: count((e) => e.metric.status === s),
    }));
  if (lens === 'owner') return [...palette.owners.values()].map((o) => ({ label: o.label, color: `var(--${o.hue}-9)`, shape: 'square' as const, value: o.count }));
  if (lens === 'freshness')
    return FRESHNESS.map((f) => ({ label: f.label, color: `var(--${FRESHNESS_HUE[f.value]}-9)`, shape: 'square' as const, value: count((e) => e.freshness === f.value) }));
  return [...palette.groups.values()].map((g) => ({ label: g.label, color: `var(--${g.hue}-9)`, shape: 'square' as const, value: g.count }));
}

export function TablePage() {
  const { store } = useApp<Schema>();
  const state = useAsync(() => loadTable(store), [store]);
  return <TableStage data={state.data} loading={state.loading} error={state.error} reload={state.reload} />;
}

function TableStage({
  data,
  loading,
  error,
  reload,
}: {
  data: TableData | undefined;
  loading: boolean;
  error: { message: string } | null;
  reload: () => void | Promise<void>;
}) {
  const app = useApp<Schema>();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const flat = reduced || !supportsWebGL();
  const [params, setParams] = useSearchParams();
  const lens = (LENS_KEYS.includes(params.get('lens') as Lens) ? params.get('lens') : 'domain') as Lens;
  const view: StageView = params.get('view') === 'list' ? 'list' : 'stage';
  // The query lives in local state so fast typing never races the URL; the URL follows it (for deep links).
  const [q, setQText] = useState(params.get('q') ?? '');
  const focusId = params.get('el');
  const [viewAs, setViewAs] = useState<ViewAs>(app.isAdmin ? 'steward' : 'owner');
  const [sideOpen, setSideOpen] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [todayId, setTodayId] = useState<string | null>(null);

  // react-router's functional updater reads the params of the last render, so two quick updates (choose the list,
  // then type) would drop the first. Keep the latest params in a ref and build every update from it.
  const latest = useRef(params);
  latest.current = params;
  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(latest.current);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      latest.current = next;
      setParams(next, { replace: true });
    },
    [setParams],
  );
  const setLens = (l: Lens) => setParam({ lens: l === 'domain' ? null : l });
  const setView = (v: StageView) => setParam({ view: v === 'list' ? 'list' : null });
  const setQ = (v: string) => {
    setQText(v);
    setParam({ q: v || null });
  };
  const focus = (id: string | null) => setParam({ el: id });
  const open = (id: string) => navigate(`/metrics/${id}`);

  const now = useMemo(() => new Date(), []);
  const elements = useMemo(() => (data ? toElements(data.metrics, now) : []), [data, now]);
  const byId = useMemo(() => new Map(elements.map((e) => [e.metric.id, e])), [elements]);
  const layout = useMemo(() => tableLayout(elements), [elements]);
  const palette = useMemo(() => makePalette(elements), [elements]);
  const hits = useMemo(() => searchMetrics(data?.metrics ?? [], q), [data, q]);
  const hitIds = useMemo(() => new Set(hits.map((h) => h.metric.id)), [hits]);
  const searching = q.trim().length > 0;

  const signals = useMemo(
    () => (data ? todaySignals({ elements, sentBack: data.sentBack, now, role: viewAs, me: app.me.sub }) : []),
    [data, elements, now, viewAs, app.me.sub],
  );
  const today: TodayItem[] = signals.map((s) => ({
    id: s.id,
    title: s.title,
    severity: s.severity,
    value: s.value,
    unit: s.unit,
    lens: LENSES.find((l) => l.value === s.lens)?.label,
    meta: s.meta,
  }));
  const pickToday = (item: TodayItem) => {
    const s = signals.find((x) => x.id === item.id);
    if (!s) return;
    setTodayId(s.id);
    setQText('');
    setParam({ el: s.metricId, lens: s.lens === 'domain' ? null : s.lens, q: null, view: null });
  };

  const isDim = (el: Element) => (searching && !hitIds.has(el.metric.id)) || (viewAs === 'owner' && el.metric.ownerSub !== app.me.sub);
  const isAwaiting = (el: Element) => viewAs === 'steward' && app.isAdmin && el.metric.status === 'in_review' && el.metric.ownerSub !== app.me.sub;

  useHotkeys({
    '/': () => document.querySelector<HTMLInputElement>('[data-find]')?.focus(),
    n: () => navigate('/metrics/new'),
    'shift+?': () => setSheet(true),
    escape: () => {
      if (focusId) focus(null);
      else if (q) setQ('');
    },
  });

  const focused = focusId ? byId.get(focusId) : undefined;
  const reviewHref = focused && app.isAdmin && focused.metric.status === 'in_review' && focused.metric.ownerSub !== app.me.sub ? `/review?id=${focused.metric.id}` : null;
  const peek = focused ? (
    <ElementPeek
      el={focused}
      palette={palette}
      lens={lens}
      onClose={desktop ? () => focus(null) : undefined}
      onOpen={() => open(focused.metric.id)}
      reviewHref={reviewHref}
    />
  ) : null;

  const groups = palette.groups.size;
  const approved = elements.filter((e) => e.metric.status === 'approved').length;
  const meta = data ? (
    <span className="num">
      {plural(elements.length, 'element')} · {plural(groups, 'group')} · {approved} approved
    </span>
  ) : (
    <span>Arranging the table…</span>
  );
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(now);

  const tableProps = {
    elements,
    layout,
    lens,
    palette,
    focusId,
    onOpen: open,
    isDim,
    isAwaiting,
    sideWidth: sideOpen ? 356 : 0,
    flat,
  };

  let stage;
  if (error && !data)
    stage = (
      <StageMessage icon={<CloudOff />} title="The table could not be loaded" action={<Button icon={<RotateCw aria-hidden="true" />} onClick={() => void reload()}>Retry</Button>}>
        {error.message}
      </StageMessage>
    );
  else if (loading || !data) stage = <GhostTable />;
  else if (elements.length === 0)
    stage = (
      <StageMessage
        icon={<FlaskConical />}
        title="The table is empty"
        action={
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => navigate('/metrics/new')}>
            Propose the first metric
          </Button>
        }
      >
        Start with the number people argue about most.
      </StageMessage>
    );
  else
    stage = desktop ? (
      <DesktopTable {...tableProps} onSelect={(id) => focus(id === focusId ? null : id)} peek={peek} />
    ) : (
      <PhoneTable {...tableProps} onSelect={open} />
    );

  return (
    <>
      <StagePage
        label="Periodic table of metrics"
        view={view}
        className="[&_h1]:font-normal"
        breadcrumb={[
          {
            label: 'Dictionary',
            onClick: () => {
              setQText('');
              setParam({ el: null, q: null });
            },
          },
          { label: focused ? focused.metric.domain : 'All groups' },
        ]}
        title={<span className="x-serif text-[30px] leading-8 tracking-[-0.015em] max-md:text-[28px]">The Periodic Table of Metrics</span>}
        meta={meta}
        topRight={
          <>
            <FindBox
              value={q}
              onChange={setQ}
              hits={hits}
              showResults={view === 'stage'}
              byId={byId}
              palette={palette}
              lens={lens}
              onPick={(id) => {
                focus(id);
              }}
              glass={view === 'stage'}
            />
            <ViewToggle value={view} onChange={setView} glass={view === 'stage'} stageLabel="Table" stageIcon={<Atom aria-hidden="true" />} />
            <Button
              variant="primary"
              className="max-md:hidden"
              icon={<Plus aria-hidden="true" />}
              onClick={() => navigate('/metrics/new')}
              data-testid="propose-button"
            >
              Propose
            </Button>
            <IconButton
              label="Keyboard shortcuts"
              icon={<Keyboard />}
              className={view === 'stage' ? 'x-glass rounded-full! max-md:hidden' : 'max-md:hidden'}
              onClick={() => setSheet(true)}
            />
          </>
        }
        lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} />}
        legend={
          data && elements.length ? (
            <Legend title={LENSES.find((l) => l.value === lens)?.label} items={legendFor(lens, elements, palette)} collapsible defaultOpen={desktop} />
          ) : undefined
        }
        bottomRight={
          <ViewAsSwitch
            value={viewAs}
            onChange={(v) => setViewAs(v as ViewAs)}
            options={[
              { value: 'steward', label: 'Steward' },
              { value: 'owner', label: 'Owner', name: app.me.displayName },
            ]}
          />
        }
        side={
          <TodayPanel
            bare
            items={today}
            date={dateLabel}
            activeId={todayId && focusId && signals.find((s) => s.id === todayId)?.metricId === focusId ? todayId : null}
            onSelect={pickToday}
            empty={viewAs === 'owner' ? 'None of your elements need you today.' : 'The review queue is empty.'}
          />
        }
        sideCount={today.length}
        sideOpen={sideOpen}
        onSideOpenChange={setSideOpen}
        stage={stage}
        list={
          data ? (
            <ElementList
              hits={hits}
              byId={byId}
              palette={palette}
              lens={lens}
              focusId={focusId}
              query={q}
              onClear={() => setQ('')}
              defineHref={`/metrics/new?name=${encodeURIComponent(q.trim())}`}
            />
          ) : (
            <GhostList />
          )
        }
      >
        {!desktop && view === 'stage' && peek}
        {view === 'list' && (
          <p className="m-0 mt-3 text-xs text-muted" aria-live="polite" data-testid="result-count">
            {searching ? `${plural(hits.length, 'element')} found, name matches first, then synonyms, measures and definitions` : plural(elements.length, 'element')}
          </p>
        )}
      </StagePage>
      <ShortcutSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

/** Loading: ghost tiles in the table's shape. */
function GhostTable() {
  const cols = [4, 2, 2, 2, 2, 2, 4];
  return (
    <div className="absolute inset-0 grid place-items-center pr-[var(--side-w,0px)]" role="status" aria-label="Loading the table">
      <div className="flex items-end gap-2">
        {cols.map((h, i) => (
          <div key={i} className="flex flex-col gap-2">
            {Array.from({ length: h }, (_, j) => (
              <div key={j} className="x-skeleton size-[68px] rounded-[9px] max-md:size-[44px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GhostList() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="x-skeleton h-11 rounded-lg" />
      ))}
    </div>
  );
}

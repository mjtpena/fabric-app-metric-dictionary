/**
 * The Lab: propose a new metric or revise one. The element it becomes is previewed live (symbol, number, group colour,
 * finish), possible duplicates are found as you type (name, synonyms, measure), and revisions show tracked changes
 * against the approved version.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import type { DataStore } from '@x10/shared/data';
import { commaList, describeError, formatDateTime, formatRelative, useAsync, type AppErrorInfo } from '@x10/shared/lib';
import { Breadcrumb, Button, cx, DataState, Dialog, Field, InlineError, Input, Skeleton, TextArea } from '@x10/shared/ui';

import { Caption, Notice, StatusChip } from '../components/bits';
import { FINISH, makePalette, StaticTile, SymbolChip } from '../components/element';
import { DiffLegend, ValueChange, WordDiff } from '../components/WordDiff';
import { GROUP_HUES, previewSymbol, STATUS_HUE, toElements } from '../domain/elements';
import { createMetric, getMetricForEdit, listMetrics, saveMetric } from '../domain/metrics';
import {
  bumpMinor,
  changedContent,
  cleanInput,
  domainCounts,
  DuplicateNameError,
  emptyInput,
  findDuplicateName,
  inputFromMetric,
  sameDomain,
  StaleEditError,
  validateMetricInput,
  type MetricInput,
} from '../domain/rules';
import { similarMetrics } from '../domain/similar';
import { limits, type Metric, type MetricVersion, type Schema } from '../model';

interface EditorData {
  metric: Metric | null;
  approved: MetricVersion | null;
  all: Metric[];
}

export function EditorPage() {
  const { id } = useParams();
  const { store } = useApp<Schema>();
  const state = useEditorData(store, id);
  return (
    <DataState state={state} skeleton={<LabSkeleton />}>
      {(d) => <EditorForm key={d.metric ? `${d.metric.id}:${d.metric.updatedAt}` : 'new'} data={d} reload={state.reload} />}
    </DataState>
  );
}

function LabSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Skeleton width={260} height={36} />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton width={90} height={12} />
            <Skeleton width="100%" height={i === 2 ? 96 : 32} />
          </div>
        ))}
      </div>
      <Skeleton width={132} height={132} className="rounded-[14px]" />
    </div>
  );
}

function useEditorData(store: DataStore<Schema>, id: string | undefined) {
  return useAsync<EditorData>(async () => (id ? getMetricForEdit(store, id) : { metric: null, approved: null, all: await listMetrics(store) }), [store, id]);
}

type Touched = Partial<Record<keyof MetricInput, boolean>>;

const bottomBar =
  'z-20 mt-2 flex flex-wrap gap-2 max-md:fixed max-md:inset-x-0 max-md:mt-0 max-md:border-t max-md:border-line max-md:bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] max-md:px-4 max-md:py-3 max-md:backdrop-blur-md max-md:[&>button]:h-11 max-md:[&>button]:flex-1';

function EditorForm({ data, reload }: { data: EditorData; reload: () => Promise<void> }) {
  const app = useApp<Schema>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { metric, approved, all } = data;
  const [values, setValues] = useState<MetricInput>(() =>
    metric ? inputFromMetric(metric) : { ...emptyInput, name: (params.get('name') ?? '').slice(0, limits.name.max) },
  );
  const [changeNote, setChangeNote] = useState('');
  const [touched, setTouched] = useState<Touched>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorInfo | null>(null);
  const [stale, setStale] = useState<Metric | null>(null);
  const ids = {
    name: useId(),
    domain: useId(),
    domains: useId(),
    definition: useId(),
    formula: useId(),
    measureName: useId(),
    modelRef: useId(),
    synonyms: useId(),
    note: useId(),
  };

  const errors = validateMetricInput(values);
  const show = (k: keyof MetricInput) => (submitted || touched[k] ? (errors[k] ?? null) : null);
  const duplicate = findDuplicateName(all, values.name, metric?.id ?? null);
  const domains = useMemo(() => domainCounts(all).map((d) => d.domain), [all]);
  const clean = cleanInput(values);
  const changed = metric ? changedContent(metric, clean) : [];
  const set = (k: keyof MetricInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const blur = (k: keyof MetricInput) => () => setTouched((t) => ({ ...t, [k]: true }));

  if (metric && metric.ownerSub !== app.me.sub) {
    return (
      <Notice tone="warn" title="Only the owner can revise this metric" testId="not-owner">
        {metric.name} is owned by {metric.ownerName}. Ask them to change it, or <Link to={`/metrics/${metric.id}`}>go back to the element card</Link>.
      </Notice>
    );
  }
  if (metric?.status === 'deprecated') {
    return (
      <Notice tone="warn" title="Deprecated metrics cannot be edited">
        <Link to={`/metrics/${metric.id}`}>Go back to {metric.name}</Link>.
      </Notice>
    );
  }

  const save = async (force = false) => {
    setSubmitted(true);
    setError(null);
    if (Object.values(errors).some(Boolean) || duplicate) return;
    setBusy(true);
    try {
      if (!metric) {
        const created = await createMetric(app.store, app.me, values);
        navigate(`/metrics/${created.id}`, { state: { flash: 'Draft created. Submit it for review when it is ready.' } });
        return;
      }
      const res = await saveMetric(app.store, app.me, metric.id, values, {
        loadedUpdatedAt: metric.updatedAt,
        force,
        changeNote: changeNote.trim() || null,
      });
      const flash = res.reopened
        ? `Saved as v${res.metric.version} and sent back for review. v${metric.version} stays the approved version until then.`
        : res.version
          ? `Saved. v${res.metric.version} history updated.`
          : 'Saved.';
      navigate(`/metrics/${metric.id}`, { state: { flash } });
    } catch (e) {
      if (e instanceof StaleEditError) setStale(e.current);
      else if (e instanceof DuplicateNameError) setTouched((t) => ({ ...t, name: true }));
      else setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const base = approved ?? (metric ? { version: metric.version, definition: metric.definition, formula: metric.formula, measureName: metric.measureName } : null);

  return (
    <>
      <Breadcrumb
        items={
          metric
            ? [
                { label: 'Table', to: '/' },
                { label: metric.name, to: `/metrics/${metric.id}` },
                { label: 'Lab' },
              ]
            : [{ label: 'Table', to: '/' }, { label: 'Lab' }]
        }
      />
      <header className="mb-6 mt-3">
        <h1 className="x-serif m-0 text-[40px] leading-[1.05] tracking-[-0.015em] max-md:text-[32px]">{metric ? `Revise ${metric.name}` : 'Propose a metric'}</h1>
        <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-muted">
          {metric ? (
            <>
              <StatusChip status={metric.status} />
              <span className="font-mono num">v{metric.version}</span>
              <span>last saved {formatRelative(metric.updatedAt)}</span>
            </>
          ) : (
            <span>New elements start as drafts owned by you.</span>
          )}
        </p>
      </header>

      {metric?.status === 'approved' && (
        <Notice tone={changed.length ? 'warn' : 'info'} title={changed.length ? `Saving will create v${bumpMinor(metric.version)}` : 'This metric is approved'} testId="approved-edit-notice">
          {changed.length
            ? `You changed the ${changed.join(', ')}. Saving sends v${bumpMinor(metric.version)} back to the stewards for review; v${metric.version} stays the approved version until then.`
            : `Changing the definition, formula or measure creates a new minor version and sends it back for review. Name, domain, synonyms and model changes do not.`}
        </Notice>
      )}

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form
          noValidate
          className="min-w-0 max-md:pb-20"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Name" htmlFor={ids.name} required error={show('name')} counter={{ value: values.name.length, max: limits.name.max }}>
            <Input id={ids.name} value={values.name} onChange={set('name')} onBlur={blur('name')} invalid={!!show('name') || !!duplicate} autoComplete="off" />
          </Field>
          {duplicate && (
            <div className="-mt-2 mb-4" data-testid="duplicate-warning">
              <p role="alert" className="m-0 text-sm font-medium text-bad-text">
                A metric called “{duplicate.name}” already exists. Names are unique, ignoring case and spaces.
              </p>
              <Link to={`/metrics/${duplicate.id}`} className="text-sm font-semibold text-accent-11">
                Open the existing one
              </Link>
            </div>
          )}
          <SimilarInline all={all} metric={metric} values={values} />
          <Field label="Domain" htmlFor={ids.domain} required error={show('domain')} hint="The group it joins on the table, such as Finance or Sales.">
            <Input id={ids.domain} list={ids.domains} value={values.domain} onChange={set('domain')} onBlur={blur('domain')} invalid={!!show('domain')} />
            <datalist id={ids.domains}>
              {domains.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Definition"
            htmlFor={ids.definition}
            required
            error={show('definition')}
            hint="Plain English: what it measures and what is in or out."
            counter={{ value: values.definition.length, max: limits.definition.max }}
          >
            <TextArea id={ids.definition} rows={5} value={values.definition} onChange={set('definition')} onBlur={blur('definition')} invalid={!!show('definition')} />
          </Field>
          <Field
            label="Formula"
            htmlFor={ids.formula}
            required
            error={show('formula')}
            hint="The calculation in business wording, not DAX."
            counter={{ value: values.formula.length, max: limits.formula.max }}
          >
            <TextArea id={ids.formula} rows={3} className="font-mono text-sm" value={values.formula} onChange={set('formula')} onBlur={blur('formula')} invalid={!!show('formula')} />
          </Field>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field
              label="Measure name"
              htmlFor={ids.measureName}
              error={show('measureName')}
              hint="Such as [Total Revenue]. Blank if not built yet."
              counter={{ value: values.measureName.length, max: limits.measureName.max }}
            >
              <Input id={ids.measureName} className="font-mono text-sm" value={values.measureName} onChange={set('measureName')} onBlur={blur('measureName')} invalid={!!show('measureName')} />
            </Field>
            <Field label="Semantic model" htmlFor={ids.modelRef} error={show('modelRef')} hint="Where the measure lives." counter={{ value: values.modelRef.length, max: limits.modelRef.max }}>
              <Input id={ids.modelRef} value={values.modelRef} onChange={set('modelRef')} onBlur={blur('modelRef')} invalid={!!show('modelRef')} />
            </Field>
          </div>
          <Field
            label="Synonyms"
            htmlFor={ids.synonyms}
            error={show('synonyms')}
            hint="Comma-separated names people also search for, such as ARR, Run rate."
            counter={{ value: values.synonyms.length, max: limits.synonyms.max }}
          >
            <Input id={ids.synonyms} value={values.synonyms} onChange={set('synonyms')} onBlur={blur('synonyms')} invalid={!!show('synonyms')} />
          </Field>
          {metric && (
            <Field
              label="Change note"
              htmlFor={ids.note}
              hint={changed.length ? 'Shown on the isotope. Blank describes the change automatically.' : 'Only used when the definition, formula or measure changes.'}
              counter={{ value: changeNote.length, max: limits.changeNote.max }}
              error={changeNote.length > limits.changeNote.max ? `Keep the note to ${limits.changeNote.max} characters or fewer.` : null}
            >
              <TextArea id={ids.note} rows={2} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} invalid={changeNote.length > limits.changeNote.max} />
            </Field>
          )}
          {submitted && (Object.values(errors).some(Boolean) || duplicate) && <InlineError error="Fix the highlighted fields, then save again." />}
          <InlineError error={error} />
          <div className={bottomBar} style={{ bottom: 'var(--x-bottom-inset)' }}>
            <Button type="submit" variant="primary" icon={metric ? undefined : <FlaskConical aria-hidden="true" />} busy={busy} disabled={changeNote.length > limits.changeNote.max}>
              {metric ? 'Save changes' : 'Create draft'}
            </Button>
            <Button onClick={() => navigate(metric ? `/metrics/${metric.id}` : '/')}>Cancel</Button>
          </div>
        </form>

        <aside className="min-w-0">
          <div className="space-y-8 lg:sticky lg:top-20">
            <LabPreview all={all} metric={metric} values={values} />
            <Similar all={all} metric={metric} values={values} exact={duplicate?.id ?? null} />
            {base && (
              <section data-testid="diff-panel">
                <Caption>Tracked changes</Caption>
                <h2 className="m-0 text-base font-semibold">{approved ? `Changes since approved (v${approved.version})` : 'Changes since last save'}</h2>
                <div className="mb-3 mt-1.5">
                  <DiffLegend />
                </div>
                <WordDiff label="Definition" before={base.definition} after={values.definition} testId="diff-definition" />
                <WordDiff label="Formula" before={base.formula} after={values.formula} mono testId="diff-formula" />
                <ValueChange label="Measure" before={base.measureName} after={values.measureName} />
              </section>
            )}
          </div>
        </aside>
      </div>

      <Dialog
        open={!!stale}
        onClose={() => setStale(null)}
        title="This metric changed while you were editing"
        footer={
          <>
            <Button
              onClick={() => {
                setStale(null);
                void reload();
              }}
            >
              Discard mine and reload
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => {
                setStale(null);
                void save(true);
              }}
            >
              Save anyway
            </Button>
          </>
        }
      >
        {stale && (
          <div data-testid="stale-dialog">
            <p className="m-0">
              {stale.name} was saved {formatRelative(stale.updatedAt)} ({formatDateTime(stale.updatedAt)}), after you opened this form. It may have
              been edited in another tab or reviewed by a steward; it is now <StatusChip status={stale.status} /> at v{stale.version}.
            </p>
            <p className="m-0 mt-2 text-sm text-muted">Save anyway to replace it with your version (the last save wins), or discard your edits and load the latest.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ Lab panels */

/** The element this proposal becomes: symbol, number, group colour and finish, live as you type. */
function LabPreview({ all, metric, values }: { all: Metric[]; metric: Metric | null; values: MetricInput }) {
  const elements = useMemo(() => toElements(all), [all]);
  const palette = useMemo(() => makePalette(elements), [elements]);
  const symbol = previewSymbol(all, values.name, metric?.id ?? null);
  const n = metric ? (elements.find((e) => e.metric.id === metric.id)?.n ?? elements.length) : elements.length + 1;
  const known = [...palette.groups.values()].find((g) => sameDomain(g.label, values.domain));
  const hue = known ? known.hue : values.domain.trim() ? GROUP_HUES[palette.groups.size % GROUP_HUES.length] : 'gray';
  const status = metric ? metric.status : 'draft';
  return (
    <section aria-label="Element preview" data-testid="lab-preview">
      <Caption>{metric ? 'The element' : 'Your element'}</Caption>
      <div className="flex items-end gap-5">
        <StaticTile n={n} symbol={symbol} name={values.name.trim() || 'Unnamed'} corner={metric?.version ?? '1.0'} hue={hue} finish={FINISH[status]} size={136} />
        <dl className="m-0 space-y-2 pb-1">
          <div>
            <dt className="x-legend-label text-[10px] text-muted">Symbol</dt>
            <dd className="m-0 font-mono text-sm" data-testid="lab-symbol">
              {symbol}
            </dd>
          </div>
          <div>
            <dt className="x-legend-label text-[10px] text-muted">Group</dt>
            <dd className="m-0 text-sm">{values.domain.trim() ? (known ? known.label : `${values.domain.trim()} (new)`) : '—'}</dd>
          </div>
          <div>
            <dt className="x-legend-label text-[10px] text-muted">Atomic no.</dt>
            <dd className="m-0 font-mono text-sm num">{n}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Live duplicate detection: elements whose name, synonyms or measure match the name or any synonym typed. */
function Similar({ all, metric, values, exact }: { all: Metric[]; metric: Metric | null; values: MetricInput; exact: string | null }) {
  const elements = useMemo(() => toElements(all), [all]);
  const byId = useMemo(() => new Map(elements.map((e) => [e.metric.id, e])), [elements]);
  const queries = [values.name, ...commaList(values.synonyms)].map((q) => q.trim()).filter((q) => q.length >= 3);
  const list = similarMetrics(all, values.name, values.synonyms, metric?.id ?? null);
  return (
    <section aria-labelledby="similar-h" data-testid="similar">
      <Caption id="similar-h" count={queries.length ? list.length : undefined}>
        Possible duplicates
      </Caption>
      {!queries.length ? (
        <p className="m-0 text-sm text-muted">Type a name to check the table.</p>
      ) : list.length === 0 ? (
        <p className="m-0 inline-flex items-center gap-2 text-sm text-ok-text">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ok-solid" />
          No similar element on the table
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {list.map((s) => {
            const el = byId.get(s.id)!;
            return (
              <li key={s.id} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0" data-testid="similar-hit">
                <SymbolChip symbol={el.symbol} hue={STATUS_HUE[el.metric.status]} finish={FINISH[el.metric.status]} size={32} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/metrics/${el.metric.id}`}
                    className={cx('block truncate text-sm font-medium text-fg no-underline hover:underline', el.metric.status === 'deprecated' && 'text-muted line-through')}
                  >
                    {el.metric.name}
                  </Link>
                  <span className={cx('block truncate text-xs', s.id === exact ? 'font-medium text-bad-text' : 'text-muted')}>{s.id === exact ? 'Same name: blocked' : s.reason}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Phones: the duplicate check right under the name, since the side panel sits below the form. */
function SimilarInline({ all, metric, values }: { all: Metric[]; metric: Metric | null; values: MetricInput }) {
  const elements = useMemo(() => toElements(all), [all]);
  const byId = useMemo(() => new Map(elements.map((e) => [e.metric.id, e])), [elements]);
  const list = similarMetrics(all, values.name, values.synonyms, metric?.id ?? null, 3);
  if (values.name.trim().length < 3 || !list.length) return null;
  return (
    <div className="-mt-2 mb-4 lg:hidden" aria-label="Possible duplicates">
      <p className="x-legend-label m-0 mb-1.5 text-[10px] text-muted">Possible duplicates</p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {list.map((h) => {
          const el = byId.get(h.id)!;
          return (
            <li key={h.id}>
              <Link to={`/metrics/${h.id}`} className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-3 text-sm text-fg no-underline">
                <SymbolChip symbol={el.symbol} hue={STATUS_HUE[el.metric.status]} finish={FINISH[el.metric.status]} size={26} className="!rounded-full" />
                <span className={cx('max-w-[180px] truncate', el.metric.status === 'deprecated' && 'text-muted line-through')}>{el.metric.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

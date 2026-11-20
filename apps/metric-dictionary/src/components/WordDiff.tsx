import { Fragment, useMemo } from 'react';

import { cx } from '@x10/shared/ui';

import { diffStats, diffWords, type DiffPart } from '../domain/diff';

const addCls =
  'rounded-sm bg-ok-soft px-0.5 font-semibold text-ok underline decoration-2 underline-offset-[3px] [text-decoration-skip-ink:none]';
const delCls = 'rounded-sm bg-bad-soft px-0.5 text-bad line-through decoration-2';

function Part({ p }: { p: DiffPart }) {
  if (p.op === 'same') return <>{p.text}</>;
  if (p.op === 'add')
    return (
      <ins className={addCls} data-diff="add">
        <span className="sr-only">added: </span>
        <span aria-hidden="true" className="mr-0.5 text-[0.75em] no-underline">
          +
        </span>
        {p.text}
      </ins>
    );
  return (
    <del className={delCls} data-diff="del">
      <span className="sr-only">removed: </span>
      <span aria-hidden="true" className="mr-0.5 text-[0.75em]">
        −
      </span>
      {p.text}
    </del>
  );
}

/** Legend for the diff styles: underline and "+" for added, strike-through and "−" for removed. */
export function DiffLegend() {
  return (
    <p className="m-0 flex flex-wrap items-center gap-3 text-xs text-muted">
      <span>
        <ins className={addCls}>
          <span aria-hidden="true" className="mr-0.5">
            +
          </span>
          added
        </ins>{' '}
        underlined
      </span>
      <span>
        <del className={delCls}>
          <span aria-hidden="true" className="mr-0.5">
            −
          </span>
          removed
        </del>{' '}
        struck through
      </span>
    </p>
  );
}

/** Word-level diff of two texts. */
export function WordDiff({
  label,
  before,
  after,
  mono,
  testId,
}: {
  label: string;
  before: string;
  after: string;
  mono?: boolean;
  testId?: string;
}) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  const stats = diffStats(parts);
  return (
    <div className="mb-4 last:mb-0" data-testid={testId}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted tabular-nums" data-testid={testId ? `${testId}-stats` : undefined}>
          {stats.changed ? `+${stats.added} / −${stats.removed} words` : 'No changes'}
        </span>
      </div>
      <p
        className={cx(
          'relative m-0 whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 text-sm leading-relaxed',
          mono && 'font-mono',
        )}
      >
        {parts.length === 0 ? (
          <span className="text-muted">Empty</span>
        ) : (
          parts.map((p, i) => (
            <Fragment key={i}>
              {p.lead}
              <Part p={p} />
            </Fragment>
          ))
        )}
      </p>
    </div>
  );
}

/** One line for a short value such as the measure name: "old → new" with the same cues. */
export function ValueChange({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  const a = (before ?? '').trim();
  const b = (after ?? '').trim();
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="m-0 mb-1 text-sm font-semibold">{label}</h3>
      {a === b ? (
        <p className="m-0 text-sm text-muted">{a ? <span className="font-mono">{a}</span> : 'None'} · no changes</p>
      ) : (
        <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-sm">
          {a ? (
            <del className={delCls}>
              <span className="sr-only">removed: </span>
              {a}
            </del>
          ) : (
            <span className="font-sans text-muted">None</span>
          )}
          <span aria-hidden="true">→</span>
          {b ? (
            <ins className={addCls}>
              <span className="sr-only">added: </span>
              {b}
            </ins>
          ) : (
            <span className="font-sans text-muted">None</span>
          )}
        </p>
      )}
    </div>
  );
}

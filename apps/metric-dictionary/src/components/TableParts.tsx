/** Pieces around the periodic table: the element peek, the find box with ranked hits, and the list view. */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';

import { formatRelative } from '@x10/shared/lib';
import { Avatar, Button, cx, FloatingPanel, IconButton, Kbd, Table, TableWrap, Td, Th, Tr, useIsDesktop } from '@x10/shared/ui';

import type { Element } from '../domain/elements';
import { matchLabel, type SearchHit } from '../domain/search';
import type { Metric } from '../model';
import { FINISH, hueFor, StatusMark, SymbolChip, type Lens, type Palette } from './element';

/* ------------------------------------------------------------------ peek */

export function ElementPeek({
  el,
  palette,
  lens,
  onClose,
  onOpen,
  reviewHref,
  className,
}: {
  el: Element;
  palette: Palette;
  lens: Lens;
  onClose?: () => void;
  onOpen: () => void;
  reviewHref?: string | null;
  className?: string;
}) {
  const m = el.metric;
  const groupHue = palette.groups.get(el.group)?.hue ?? 'gray';
  return (
    <FloatingPanel padding="none" className={cx('relative p-4', className)} data-testid="element-peek">
      <div className="flex items-center gap-2 pr-8">
        <SymbolChip symbol={el.symbol} hue={hueFor(el, lens, palette)} finish={FINISH[m.status]} size={30} />
        <span className="x-legend-label flex min-w-0 items-center gap-1.5 text-[10px] text-muted">
          <span className="num">No. {el.n}</span>
          <span aria-hidden="true">·</span>
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: `var(--${groupHue}-9)` }} />
          <span className="truncate">{m.domain}</span>
        </span>
      </div>
      {onClose && (
        <span className="absolute right-2 top-2">
          <IconButton size="sm" label="Close preview" icon={<X />} onClick={onClose} />
        </span>
      )}
      <h2 className={cx('x-serif m-0 mt-2 text-[28px] leading-[1.05] tracking-[-0.01em]', m.status === 'deprecated' && 'text-muted line-through decoration-1')}>{m.name}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-muted">
        <StatusMark status={m.status} className="text-fg" />
        <span className="font-mono num">v{m.version}</span>
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={m.ownerName} size="xs" />
          {m.ownerName}
        </span>
      </div>
      <p className="m-0 mt-3 line-clamp-4 text-sm leading-[21px] text-fg">{m.definition}</p>
      <p className="m-0 mt-2.5 line-clamp-3 rounded-lg bg-surface-sunken px-2.5 py-2 font-mono text-[12px] leading-[18px] text-muted">{m.formula}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0 truncate font-mono">{m.measureName ?? 'No measure yet'}</span>
        <span className="shrink-0 num">{formatRelative(m.updatedAt)}</span>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" iconRight={<ArrowRight aria-hidden="true" />} onClick={onOpen}>
          Open element card
        </Button>
        {reviewHref && (
          <Link to={reviewHref} className="inline-flex h-7 items-center rounded-lg px-2.5 text-ui font-medium text-accent-11 no-underline hover:bg-accent-3">
            Peer review
          </Link>
        )}
      </div>
    </FloatingPanel>
  );
}

/* ------------------------------------------------------------------ find */

export function FindBox({
  value,
  onChange,
  hits,
  showResults,
  byId,
  palette,
  lens,
  onPick,
  glass,
}: {
  value: string;
  onChange: (v: string) => void;
  hits: SearchHit[];
  showResults: boolean;
  byId: Map<string, Element>;
  palette: Palette;
  lens: Lens;
  onPick: (id: string) => void;
  glass: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [value]);
  const list = hits.slice(0, 7);
  const show = showResults && open && value.trim().length > 0;
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };
  return (
    <div className="relative w-full sm:w-64">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-faint" />
      <label htmlFor="find-element" className="sr-only">
        Search metrics
      </label>
      <input
        ref={input}
        id="find-element"
        data-find
        value={value}
        autoComplete="off"
        placeholder="Find an element…"
        role={showResults ? 'combobox' : undefined}
        aria-expanded={showResults ? show : undefined}
        aria-controls={showResults ? 'find-results' : undefined}
        aria-activedescendant={show && list[active] ? `find-${list[active].metric.id}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (value) onChange('');
            else input.current?.blur();
          } else if (show && e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(list.length - 1, a + 1));
          } else if (show && e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (show && e.key === 'Enter' && list[active]) {
            e.preventDefault();
            pick(list[active].metric.id);
          }
        }}
        className={cx(
          'x-control h-8 w-full rounded-full! pl-8 pr-9 text-sm text-fg outline-none placeholder:text-faint max-md:h-10 max-md:text-base',
          glass ? 'x-glass' : 'border border-line-strong bg-field',
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted hover:bg-gray-4 hover:text-fg"
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 max-md:hidden">
          <Kbd>/</Kbd>
        </span>
      )}
      {show && (
        <div id="find-results" role="listbox" aria-label="Matching elements" className="x-glass absolute right-0 top-[calc(100%+6px)] z-30 w-[min(340px,calc(100vw-32px))] p-1.5" data-testid="find-results">
          {list.length === 0 ? (
            <p className="m-0 px-3 py-3 text-sm text-muted">No element matches “{value.trim()}”.</p>
          ) : (
            list.map((h, i) => {
              const el = byId.get(h.metric.id);
              if (!el) return null;
              return (
                <div
                  key={h.metric.id}
                  id={`find-${h.metric.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-testid="search-hit"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(h.metric.id)}
                  className={cx('flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5', i === active && 'bg-[color-mix(in_oklab,var(--gray-12)_6%,transparent)]')}
                >
                  <SymbolChip symbol={el.symbol} hue={hueFor(el, lens, palette)} finish={FINISH[el.metric.status]} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-sm font-medium', el.metric.status === 'deprecated' && 'text-muted line-through')}>{h.metric.name}</span>
                    {h.field && h.field !== 'name' && (
                      <span className="block truncate text-xs text-accent-11">
                        {matchLabel[h.field]}
                        {h.matchedText ? `: ${h.matchedText}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-faint num">{el.n}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ list view */

export function ElementList({
  hits,
  byId,
  palette,
  lens,
  focusId,
  query,
  onClear,
  defineHref,
}: {
  hits: SearchHit<Metric>[];
  byId: Map<string, Element>;
  palette: Palette;
  lens: Lens;
  focusId: string | null;
  query: string;
  onClear: () => void;
  defineHref: string;
}) {
  const desktop = useIsDesktop();
  const cue = (h: SearchHit<Metric>) =>
    h.field && h.field !== 'name' ? (
      <span className="mt-0.5 block text-xs font-medium text-accent-11" data-testid="match-cue">
        {matchLabel[h.field]}
        {h.matchedText ? `: ${h.matchedText}` : ''}
      </span>
    ) : null;

  if (hits.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-line-strong/70 px-6 py-12 text-center" data-testid="list-empty">
        <p className="m-0 text-base font-semibold">No element matches “{query.trim()}”</p>
        <p className="m-0 mx-auto mt-1 max-w-[46ch] text-sm text-muted">Try a synonym or an abbreviation, or take it to the Lab if the metric is missing.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onClear}>Clear search</Button>
          <Link to={defineHref} className="inline-flex h-8 items-center rounded-lg bg-accent-9 px-3 text-ui font-medium text-accent-contrast no-underline hover:bg-accent-10">
            Define “{query.trim()}” in the Lab
          </Link>
        </div>
      </div>
    );

  if (!desktop)
    return (
      <ul className="m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0" aria-label="Metrics" data-testid="element-list">
        {hits.map((h) => {
          const el = byId.get(h.metric.id)!;
          const m = el.metric;
          return (
            <li key={m.id} data-testid="element-row" className={cx('relative flex items-center gap-3 px-3.5 py-3', focusId === m.id && 'bg-accent-2')}>
              <SymbolChip symbol={el.symbol} hue={hueFor(el, lens, palette)} finish={FINISH[m.status]} size={40} />
              <div className="min-w-0 flex-1">
                <Link to={`/metrics/${m.id}`} className={cx('block truncate font-medium text-fg no-underline after:absolute after:inset-0', m.status === 'deprecated' && 'text-muted line-through')}>
                  {m.name}
                </Link>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <StatusMark status={m.status} />
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{m.domain}</span>
                </span>
                {cue(h)}
              </div>
              <span className="font-mono text-xs text-muted num">v{m.version}</span>
            </li>
          );
        })}
      </ul>
    );

  return (
    <TableWrap label="Metrics">
      <Table data-testid="element-list">
        <thead>
          <tr>
            <Th numeric className="w-12">
              No.
            </Th>
            <Th>Element</Th>
            <Th>Domain</Th>
            <Th>Status</Th>
            <Th>Owner</Th>
            <Th>Measure</Th>
            <Th numeric>Version</Th>
            <Th numeric>Changed</Th>
          </tr>
        </thead>
        <tbody>
          {hits.map((h) => {
            const el = byId.get(h.metric.id)!;
            const m = el.metric;
            const gh = palette.groups.get(el.group)?.hue ?? 'gray';
            return (
              <Tr key={m.id} selected={focusId === m.id} data-testid="element-row">
                <Td numeric muted>
                  {el.n}
                </Td>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <SymbolChip symbol={el.symbol} hue={hueFor(el, lens, palette)} finish={FINISH[m.status]} size={30} />
                    <span className="min-w-0">
                      <Link to={`/metrics/${m.id}`} className={cx('font-medium text-fg no-underline hover:underline', m.status === 'deprecated' && 'text-muted line-through')}>
                        {m.name}
                      </Link>
                      {cue(h)}
                    </span>
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: `var(--${gh}-9)` }} />
                    {m.domain}
                  </span>
                </Td>
                <Td>
                  <StatusMark status={m.status} />
                </Td>
                <Td muted className="whitespace-nowrap">
                  {m.ownerName}
                </Td>
                <Td className="max-w-[180px] truncate font-mono text-xs text-muted">{m.measureName ?? '—'}</Td>
                <Td numeric>{m.version}</Td>
                <Td numeric muted>
                  {el.ageDays}d
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}

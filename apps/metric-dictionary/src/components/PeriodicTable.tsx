/**
 * The centrepiece: metrics laid out as a periodic table.
 * Desktop: absolutely positioned tiles sized to the stage (edges tall, middle groups low, the key in the valley,
 * deprecated elements as a detached series with decay lines to their replacements).
 * Phones: a vertically scrolling grid grouped by domain (no horizontal scroll).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { cx } from '@x10/shared/ui';

import type { Element, TableLayout } from '../domain/elements';
import { cornerFor, ElementTile, FINISH, FinishSwatch, hueFor, StaticTile, type Finish, type Lens, type Palette } from './element';

export interface TableProps {
  elements: Element[];
  layout: TableLayout;
  lens: Lens;
  palette: Palette;
  focusId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  isDim: (el: Element) => boolean;
  isAwaiting: (el: Element) => boolean;
  /** Width the right side panel takes over the stage (px). */
  sideWidth: number;
  /** No lift, flip or ping (no WebGL / reduced motion). */
  flat: boolean;
  /** Rendered next to the focused tile (desktop). */
  peek?: ReactNode;
}

const LABEL_H = 22;
const GAP_F = 0.07;
const BLOCK_F = 0.3;
const SERIES_F = 0.42;

interface Geometry {
  tile: number;
  gap: number;
  width: number;
  height: number;
  pos: Map<string, { x: number; y: number }>;
  labels: { key: string; x: number; y: number; w: number; label: string; count: number; group: string }[];
  series: { x: number; y: number } | null;
  keyBox: { x: number; y: number; w: number; h: number } | null;
}

export function tableGeometry(layout: TableLayout, aw: number, ah: number): Geometry {
  const blocks = [layout.left, ...layout.middle, layout.right].filter((b): b is NonNullable<typeof b> => !!b);
  const C = Math.max(1, layout.columns);
  const B = Math.max(1, blocks.length);
  const R = layout.rows;
  const S = layout.series.length;
  const leftCols = layout.left?.columns.length ?? 0;
  const seriesStartUnits = leftCols ? leftCols + (leftCols - 1) * GAP_F + BLOCK_F : 0;
  const unitsW = Math.max(C + (C - B) * GAP_F + (B - 1) * BLOCK_F, S ? seriesStartUnits + S + (S - 1) * GAP_F : 0);
  const unitsH = R + (R - 1) * GAP_F + (S ? SERIES_F + 1 : 0);
  const fixedH = LABEL_H + (S ? LABEL_H : 0);
  const tile = Math.max(46, Math.min(128, Math.floor(Math.min(aw / unitsW, (ah - fixedH) / unitsH))));
  const gap = Math.max(4, Math.round(tile * GAP_F));
  const blockGap = Math.round(tile * BLOCK_F);
  const step = tile + gap;
  const pos = new Map<string, { x: number; y: number }>();
  const labels: Geometry['labels'] = [];
  let cx0 = 0;
  const starts: number[] = [];
  for (const b of blocks) {
    starts.push(cx0);
    b.columns.forEach((col, j) =>
      col.forEach((el, i) => pos.set(el.metric.id, { x: cx0 + j * step, y: LABEL_H + (R - col.length + i) * step })),
    );
    const w = b.columns.length * step - gap;
    labels.push({ key: b.group, x: cx0, y: (R - b.height) * step, w, label: b.label, count: b.columns.flat().length, group: b.group });
    cx0 += w + blockGap;
  }
  let width = Math.max(0, cx0 - blockGap);
  let height = LABEL_H + R * step - gap;
  let series: Geometry['series'] = null;
  if (S) {
    const sx = leftCols ? leftCols * step - gap + blockGap : 0;
    const sy = height + Math.round(tile * SERIES_F) + LABEL_H;
    layout.series.forEach((el, i) => pos.set(el.metric.id, { x: sx + i * step, y: sy }));
    series = { x: sx, y: sy - LABEL_H };
    width = Math.max(width, sx + S * step - gap);
    height = sy + tile;
  }
  let keyBox: Geometry['keyBox'] = null;
  if (layout.middle.length && R - layout.midRows >= 1 && blocks.length >= 3) {
    const x0 = starts[1];
    const lastMid = blocks.length - 2;
    const x1 = starts[lastMid] + blocks[lastMid].columns.length * step - gap;
    const h = (R - layout.midRows) * step - 16;
    if (x1 - x0 >= tile * 2.4 && h >= tile * 0.8) keyBox = { x: x0, y: 4, w: x1 - x0, h };
  }
  return { tile, gap, width, height, pos, labels, series, keyBox };
}

/* ------------------------------------------------------------------ desktop */

export function DesktopTable(props: TableProps) {
  const { elements, layout, lens, palette, focusId, onSelect, onOpen, isDim, isAwaiting, sideWidth, flat, peek } = props;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [wave, setWave] = useState(0);
  const firstLens = useRef(lens);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A lens change replays the flip wave (left to right), unless motion is off.
  useEffect(() => {
    if (lens !== firstLens.current) setWave((w) => w + 1);
    firstLens.current = lens;
  }, [lens]);

  const padL = 28;
  const padR = sideWidth + 28;
  const padT = 114;
  const padB = 72;
  const aw = Math.max(200, size.w - padL - padR);
  const ah = Math.max(200, size.h - padT - padB);
  const g = useMemo(() => tableGeometry(layout, aw, ah), [layout, aw, ah]);
  const ox = Math.round(padL + Math.max(0, (aw - g.width) / 2));
  const oy = Math.round(padT + Math.max(0, (ah - g.height) / 2));
  const byId = useMemo(() => new Map(elements.map((e) => [e.metric.id, e])), [elements]);
  const focused = focusId ? byId.get(focusId) : undefined;
  const focusPos = focused ? g.pos.get(focused.metric.id) : undefined;
  const hovered = hoverId ? byId.get(hoverId) : undefined;
  const keyEl = hovered ?? focused ?? elements.find((e) => e.metric.status === 'approved' && !isDim(e)) ?? elements.find((e) => !isDim(e)) ?? elements[0];

  const decays = layout.series
    .map((src) => {
      const to = src.metric.replacedById ? g.pos.get(src.metric.replacedById) : undefined;
      const from = g.pos.get(src.metric.id);
      if (!to || !from) return null;
      const hot = [src.metric.id, src.metric.replacedById].some((id) => id === hoverId || id === focusId);
      const sameRow = Math.abs(to.y - from.y) < 2;
      const x1 = from.x + g.tile / 2;
      const y1 = sameRow ? from.y + g.tile : from.y;
      const x2 = to.x + g.tile / 2;
      const y2 = to.y + g.tile;
      // Same row (one deprecated element into another): a shallow arc underneath; otherwise up into the table.
      const d = sameRow
        ? `M ${x1} ${y1} C ${x1} ${y1 + g.tile * 0.32}, ${x2} ${y2 + g.tile * 0.32}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1} ${y1 - g.tile * 0.6}, ${x2} ${y2 + g.tile * 0.6}, ${x2} ${y2}`;
      return { id: src.metric.id, d, hot };
    })
    .filter((x): x is { id: string; d: string; hot: boolean } => !!x);

  const keyNav = (e: KeyboardEvent<HTMLDivElement>) => moveFocus(e, box.current);

  // The peek sits beside the focused tile, on whichever side has room.
  const peekW = 320;
  let peekStyle: React.CSSProperties | undefined;
  if (focusPos && peek) {
    const tx = ox + focusPos.x;
    const ty = oy + focusPos.y;
    const roomRight = size.w - sideWidth - 16 - (tx + g.tile + 16);
    const left = roomRight >= peekW ? tx + g.tile + 16 : Math.max(16, tx - 16 - peekW);
    const top = Math.min(Math.max(16, ty - 24), Math.max(16, size.h - 420));
    peekStyle = { left, top, width: peekW };
  }

  return (
    <div ref={box} className={cx('el-paper absolute inset-0 overflow-hidden', flat && 'el-flat')} data-testid="periodic-table" data-lens={lens} data-mode={flat ? 'flat' : 'lifted'}>
      {size.w > 0 && (
        <div
          role="group"
          aria-label="Periodic table of metrics"
          className="absolute"
          style={{ left: ox, top: oy, width: g.width, height: g.height }}
          onKeyDown={keyNav}
        >
          {/* group labels (like IUPAC group headers) */}
          {g.labels.map((l) => {
            const hue = palette.groups.get(l.group)?.hue ?? 'gray';
            return (
              <div
                key={l.key}
                className="absolute flex items-end gap-1.5 pb-1.5"
                style={{ left: l.x, top: l.y, width: l.w, height: LABEL_H }}
                data-testid="group-label"
              >
                <span aria-hidden="true" className="h-[3px] w-3 shrink-0 self-center rounded-full" style={{ background: `var(--${hue}-9)` }} />
                <span className="x-legend-label truncate text-[10px] text-world-ink-muted">{l.label}</span>
                <span className="font-mono text-[10px] text-faint num">{l.count}</span>
              </div>
            );
          })}

          {g.series && (
            <div className="absolute flex items-end gap-1.5 pb-1.5" style={{ left: g.series.x, top: g.series.y, height: LABEL_H, width: 280 }}>
              <span aria-hidden="true" className="font-serif text-sm leading-none text-world-ink-muted">*</span>
              <span className="x-legend-label text-[10px] text-world-ink-muted">Deprecated series</span>
              <span className="font-mono text-[10px] text-faint num">{layout.series.length}</span>
            </div>
          )}

          {g.keyBox && keyEl && <TableKey box={g.keyBox} el={keyEl} lens={lens} palette={palette} tile={g.tile} live={!!(hovered ?? focused)} dim={isDim(keyEl)} />}

          <svg className="pointer-events-none absolute inset-0 overflow-visible" width={g.width} height={g.height} aria-hidden="true">
            {decays.map((d) => (
              <path key={d.id} d={d.d} className="el-decay" data-hot={d.hot || undefined} />
            ))}
          </svg>

          {layout.order.map((el, i) => {
            const p = g.pos.get(el.metric.id);
            if (!p) return null;
            const colIndex = Math.round(p.x / (g.tile + g.gap));
            return (
              <ElementTile
                key={el.metric.id}
                waveKey={wave}
                el={el}
                hue={hueFor(el, lens, palette)}
                corner={cornerFor(el, lens)}
                focus={el.metric.id === focusId}
                dim={isDim(el)}
                awaiting={isAwaiting(el)}
                wave={!flat}
                delayMs={wave === 0 ? i * 18 : colIndex * 38 + (p.y / (g.tile + g.gap)) * 14}
                className="absolute"
                style={{ left: p.x, top: p.y, width: g.tile, height: g.tile, transitionProperty: 'transform, box-shadow, opacity, filter, left, top, width, height' }}
                onMouseEnter={() => setHoverId(el.metric.id)}
                onMouseLeave={() => setHoverId((h) => (h === el.metric.id ? null : h))}
                onFocus={() => setHoverId(el.metric.id)}
                onBlur={() => setHoverId((h) => (h === el.metric.id ? null : h))}
                onClick={() => onSelect(el.metric.id)}
                onDoubleClick={() => onOpen(el.metric.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && el.metric.id === focusId) {
                    e.preventDefault();
                    onOpen(el.metric.id);
                  }
                }}
              />
            );
          })}
        </div>
      )}
      {peek && peekStyle && (
        <div className="absolute z-10 animate-x-in" style={peekStyle}>
          {peek}
        </div>
      )}
    </div>
  );
}

/** Arrow keys move between tiles by position (works for the table and the phone grid). */
function moveFocus(e: KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  const dir = dirs[e.key];
  const from = e.target as HTMLElement;
  if (!dir || !root || !from.classList.contains('el-tile')) return;
  e.preventDefault();
  const r0 = from.getBoundingClientRect();
  const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
  let best: { el: HTMLElement; score: number } | null = null;
  root.querySelectorAll<HTMLElement>('button.el-tile').forEach((el) => {
    if (el === from) return;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - c0.x;
    const dy = r.top + r.height / 2 - c0.y;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 4) return;
    const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
    const score = along + across * 2.5;
    if (!best || score < best.score) best = { el, score };
  });
  (best as { el: HTMLElement } | null)?.el.focus();
}

/* ------------------------------------------------------------------ the key (in the valley) */

function TableKey({ box, el, lens, palette, tile, live, dim }: { box: NonNullable<Geometry['keyBox']>; el: Element; lens: Lens; palette: Palette; tile: number; live: boolean; dim: boolean }) {
  const size = Math.min(box.h, Math.round(tile * 1.6));
  const finishes: { finish: Finish; label: string }[] = [
    { finish: 'solid', label: 'Approved' },
    { finish: 'outlined', label: 'In review' },
    { finish: 'hatched', label: 'Draft' },
    { finish: 'faded', label: 'Deprecated' },
  ];
  const showFinishes = box.w - size > 230;
  return (
    <div className="pointer-events-none absolute flex items-start gap-4" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} data-testid="table-key">
      <div className="relative shrink-0">
        <StaticTile
          n={el.n}
          symbol={el.symbol}
          name={el.metric.name}
          corner={cornerFor(el, lens)}
          hue={hueFor(el, lens, palette)}
          finish={FINISH[el.metric.status]}
          size={size}
          className={dim ? 'opacity-25 saturate-[.2]' : live ? '' : 'opacity-90'}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        <span className="x-legend-label text-[10px] text-world-ink-muted">How to read an element</span>
        <dl className="m-0 mt-2 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-[11px] leading-4">
          <KeyLine term="No." desc="Order created" />
          <KeyLine term="Corner" desc={lens === 'owner' ? 'Owner' : lens === 'freshness' ? 'Days unchanged' : 'Version'} />
          <KeyLine term="Symbol" desc="From the name" />
          <KeyLine term="Finish" desc="Status" />
        </dl>
        {showFinishes && (
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2">
            {finishes.map((f) => (
              <span key={f.finish} className="inline-flex items-center gap-1.5 text-muted">
                <FinishSwatch finish={f.finish} hue="gray" size={12} />
                <span className="x-legend-label text-[10px]">{f.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KeyLine({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="min-w-0">
      <dt className="x-legend-label text-[10px] text-world-ink-muted">{term}</dt>
      <dd className="m-0 min-w-0 truncate text-fg/80">{desc}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ phones */

export function PhoneTable(props: TableProps) {
  const { elements, layout, lens, palette, focusId, onSelect, isDim, isAwaiting, flat } = props;
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const live = elements.filter((e) => e.metric.status !== 'deprecated');
    return [...palette.groups.entries()]
      .map(([group, g]) => ({ group, label: g.label, hue: g.hue, els: live.filter((e) => e.group === group) }))
      .filter((g) => g.els.length);
  }, [elements, palette]);

  useEffect(() => {
    if (!focusId) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-id="${focusId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: flat ? 'auto' : 'smooth' });
  }, [focusId, flat]);

  const tile = (el: Element, i: number) => (
    <ElementTile
      key={el.metric.id}
      waveKey={lens}
      el={el}
      hue={hueFor(el, lens, palette)}
      corner={cornerFor(el, lens)}
      focus={el.metric.id === focusId}
      dim={isDim(el)}
      awaiting={isAwaiting(el)}
      wave={!flat}
      delayMs={(i % 4) * 40 + Math.floor(i / 4) * 30}
      className="w-full"
      onClick={() => onSelect(el.metric.id)}
    />
  );

  return (
    <div
      ref={root}
      className={cx('el-paper absolute inset-0 overflow-y-auto overscroll-contain px-4 pt-2 pb-24', flat && 'el-flat')}
      data-testid="periodic-table"
      data-lens={lens}
      data-mode={flat ? 'flat' : 'lifted'}
      onKeyDown={(e) => moveFocus(e, root.current)}
      role="group"
      aria-label="Periodic table of metrics"
    >
      {groups.map((g) => (
        <section key={g.group} aria-label={g.label} className="mb-3">
          <h2 className="sticky top-0 z-[6] m-0 -mx-4 mb-2 flex items-center gap-2 bg-[color-mix(in_oklab,var(--el-paper)_88%,transparent)] px-4 py-2 backdrop-blur-sm" data-testid="group-label">
            <span aria-hidden="true" className="h-[3px] w-3 rounded-full" style={{ background: `var(--${g.hue}-9)` }} />
            <span className="x-legend-label text-[11px] text-world-ink-muted">{g.label}</span>
            <span className="font-mono text-[11px] text-faint num">{g.els.length}</span>
          </h2>
          <div className="grid grid-cols-4 gap-2">{g.els.map(tile)}</div>
        </section>
      ))}
      {layout.series.length > 0 && (
        <section aria-label="Deprecated series" className="mb-3">
          <h2 className="sticky top-0 z-[6] m-0 -mx-4 mb-2 flex items-center gap-2 bg-[color-mix(in_oklab,var(--el-paper)_88%,transparent)] px-4 py-2 backdrop-blur-sm">
            <span aria-hidden="true" className="font-serif text-sm leading-none text-world-ink-muted">*</span>
            <span className="x-legend-label text-[11px] text-world-ink-muted">Deprecated series</span>
            <span className="font-mono text-[11px] text-faint num">{layout.series.length}</span>
          </h2>
          <div className="grid grid-cols-4 gap-2">{layout.series.map(tile)}</div>
        </section>
      )}
    </div>
  );
}

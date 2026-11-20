/**
 * Element tiles: the visual unit of the periodic table, also used small in lists, the Lab, Peer review and the poster.
 * Colour comes from the active lens (a named ramp); the finish always shows the status.
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

import { cx } from '@x10/shared/ui';

import {
  FRESHNESS,
  FRESHNESS_HUE,
  groupHues,
  ownerHues,
  STATUS_HUE,
  type Element,
  type Hue,
} from '../domain/elements';
import { statusMeta } from '../domain/rules';
import type { MetricStatus } from '../model';

export type Lens = 'domain' | 'status' | 'owner' | 'freshness';
export type Finish = 'solid' | 'outlined' | 'hatched' | 'faded';

export const FINISH: Record<MetricStatus, Finish> = {
  approved: 'solid',
  in_review: 'outlined',
  draft: 'hatched',
  deprecated: 'faded',
};

export const FINISH_LABEL: Record<Finish, string> = {
  solid: 'Solid',
  outlined: 'Outlined',
  hatched: 'Hatched',
  faded: 'Faded',
};

export interface Palette {
  groups: ReturnType<typeof groupHues>;
  owners: ReturnType<typeof ownerHues>;
}

export function makePalette(elements: Element[]): Palette {
  return { groups: groupHues(elements), owners: ownerHues(elements) };
}

export function hueFor(el: Element, lens: Lens, palette: Palette): Hue {
  switch (lens) {
    case 'status':
      return STATUS_HUE[el.metric.status];
    case 'owner':
      return palette.owners.get(el.metric.ownerSub)?.hue ?? 'gray';
    case 'freshness':
      return FRESHNESS_HUE[el.freshness];
    default:
      return palette.groups.get(el.group)?.hue ?? 'gray';
  }
}

const STEPS = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12] as const;

/** CSS variables --h2…--h12 pointing at a named ramp. */
export function hueVars(hue: Hue): CSSProperties {
  const out: Record<string, string> = {};
  for (const s of STEPS) out[`--h${s}`] = `var(--${hue}-${s})`;
  return out as CSSProperties;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Top-right corner of a tile: the version, or what the lens is about (owner initials, age in days). */
export function cornerFor(el: Element, lens: Lens): string {
  if (lens === 'owner') return initials(el.metric.ownerName);
  if (lens === 'freshness') return `${el.ageDays}d`;
  return el.metric.version;
}

export function freshnessLabel(f: Element['freshness']): string {
  return FRESHNESS.find((x) => x.value === f)?.label ?? f;
}

export function elementLabel(el: Element): string {
  return `${el.metric.name}, symbol ${el.symbol}, element ${el.n}, ${statusMeta[el.metric.status].label}, ${el.metric.domain}`;
}

export interface ElementTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  el: Element;
  hue: Hue;
  corner?: ReactNode;
  focus?: boolean;
  dim?: boolean;
  hot?: boolean;
  /** Small accent dot: waiting for the viewer (a steward's queue). */
  awaiting?: boolean;
  /** Play the flip-in animation (on mount and when the key changes). */
  wave?: boolean;
  /** Changing it replays the flip (the button keeps focus; only the face remounts). */
  waveKey?: string | number;
  delayMs?: number;
}

export const ElementTile = forwardRef<HTMLButtonElement, ElementTileProps>(function ElementTile(
  { el, hue, corner, focus, dim, hot, awaiting, wave, waveKey, delayMs = 0, className, style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid="element-tile"
      data-id={el.metric.id}
      data-symbol={el.symbol}
      data-status={el.metric.status}
      data-finish={FINISH[el.metric.status]}
      data-focus={focus || undefined}
      data-dim={dim || undefined}
      data-hot={hot || undefined}
      data-await={awaiting || undefined}
      data-wave={wave || undefined}
      aria-label={elementLabel(el)}
      className={cx('el-tile', className)}
      style={{ ...hueVars(hue), '--d': `${delayMs}ms`, ...style } as CSSProperties}
      {...rest}
    >
      <span key={waveKey} className="el-face" aria-hidden="true">
        <span className="flex items-start justify-between gap-1">
          <span className="el-num">{el.n}</span>
          <span className="el-corner">{corner ?? el.metric.version}</span>
        </span>
        <span className="el-sym">{el.symbol}</span>
        <span className="el-name">{el.metric.name}</span>
      </span>
    </button>
  );
});

/** A static tile (not a button) for lists, the Lab preview, cards and the poster. */
export function StaticTile({
  n,
  symbol,
  name,
  corner,
  hue,
  finish,
  size,
  className,
  showName = true,
  testId,
}: {
  n: ReactNode;
  symbol: string;
  name: string;
  corner?: ReactNode;
  hue: Hue;
  finish: Finish;
  size: number;
  className?: string;
  showName?: boolean;
  testId?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      data-finish={finish}
      className={cx('el-tile pointer-events-none !cursor-default shrink-0', className)}
      style={{ ...hueVars(hue), width: size, height: size } as CSSProperties}
    >
      <span className="el-face">
        <span className="flex items-start justify-between gap-1">
          <span className="el-num">{n}</span>
          <span className="el-corner">{corner}</span>
        </span>
        <span className="el-sym">{symbol}</span>
        {showName && <span className="el-name">{name}</span>}
      </span>
    </span>
  );
}

/** A symbol chip for dense rows: the element's symbol on its finish, no number or name. */
export function SymbolChip({ symbol, hue, finish, size = 28, className }: { symbol: string; hue: Hue; finish: Finish; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-finish={finish}
      className={cx('el-tile pointer-events-none shrink-0 !rounded-[7px]', className)}
      style={{ ...hueVars(hue), width: size, height: size } as CSSProperties}
    >
      <span className="el-face !flex !items-center !justify-center !p-0">
        <span className="el-sym !m-0" style={{ fontSize: size * 0.52 }}>
          {symbol}
        </span>
      </span>
    </span>
  );
}

/** Finish swatch for legends and the key: a tiny tile in a finish. */
export function FinishSwatch({ finish, hue = 'gray', size = 14 }: { finish: Finish; hue?: Hue; size?: number }) {
  return (
    <span
      aria-hidden="true"
      data-finish={finish}
      className="el-tile pointer-events-none inline-block shrink-0 !rounded-[3px]"
      style={{ ...hueVars(hue), width: size, height: size } as CSSProperties}
    >
      <span className="el-face !p-0" style={{ boxShadow: 'none' }} />
    </span>
  );
}

/** Status as a dot plus label, coloured by the status hue (matches the status lens). */
export function StatusMark({ status, className }: { status: MetricStatus; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <FinishSwatch finish={FINISH[status]} hue={STATUS_HUE[status]} size={11} />
      <span>{statusMeta[status].label}</span>
    </span>
  );
}

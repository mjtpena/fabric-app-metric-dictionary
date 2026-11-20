import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

import { cx, type Tone } from '@x10/shared/ui';

import { StatusMark } from './element';
import type { MetricStatus } from '../model';

export function StatusChip({ status }: { status: MetricStatus }) {
  return <StatusMark status={status} className="text-ui text-fg" />;
}

export function VersionTag({ version }: { version: string }) {
  return <span className="inline-flex items-center font-mono text-xs text-muted num">v{version}</span>;
}

const rule: Record<Tone, string> = {
  ok: 'before:bg-ok-solid',
  warn: 'before:bg-warn-solid',
  bad: 'before:bg-bad-solid',
  info: 'before:bg-info-solid',
  neutral: 'before:bg-gray-8',
  brand: 'before:bg-accent-9',
};
const iconTone: Record<Tone, string> = {
  ok: 'text-ok-text',
  warn: 'text-warn-text',
  bad: 'text-bad-text',
  info: 'text-info-text',
  neutral: 'text-muted',
  brand: 'text-accent-11',
};

/** A banner: tone rule on the left, an icon and a title, so the tone is never carried by colour alone. */
export function Notice({
  tone = 'info',
  title,
  children,
  testId,
  actions,
  className,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  testId?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const Icon = tone === 'bad' ? CircleAlert : tone === 'warn' ? TriangleAlert : tone === 'ok' ? CircleCheck : Info;
  return (
    <div
      role="status"
      data-testid={testId}
      className={cx(
        'relative mb-3 overflow-hidden rounded-xl border border-line bg-surface py-3 pl-5 pr-4 text-fg before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        rule[tone],
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={cx('mt-0.5 size-4 shrink-0', iconTone[tone])} strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold">{title}</p>
          {children && <div className="mt-0.5 break-words text-sm text-muted">{children}</div>}
          {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/** Business formula in a monospace well. */
export function FormulaPanel({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <pre
      className="m-0 whitespace-pre-wrap break-words rounded-xl bg-surface-sunken px-4 py-3.5 font-mono text-[13px] leading-[22px] text-fg"
      data-testid={testId}
    >
      {children}
    </pre>
  );
}

/** Small mono caption with a hairline: section headings on detail pages. */
export function Caption({ children, id, count, action }: { children: ReactNode; id?: string; count?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 border-t border-line pt-4">
      <h2 id={id} className="x-legend-label m-0 text-[11px] font-normal text-muted">
        {children}
      </h2>
      {count !== undefined && <span className="font-mono text-[11px] text-faint num">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** Label/value pair for detail lists. */
export function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 py-2">
      <dt className="x-legend-label text-[10px] text-muted">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

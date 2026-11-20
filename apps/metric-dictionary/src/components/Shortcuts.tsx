import { Dialog, Kbd } from '@x10/shared/ui';

const KEYS: { keys: string[]; label: string }[] = [
  { keys: ['1', '2', '3', '4'], label: 'Lens: domain, status, owner, freshness' },
  { keys: ['/'], label: 'Find an element' },
  { keys: ['←', '↑', '→', '↓'], label: 'Move between elements' },
  { keys: ['Enter'], label: 'Select, then open the element card' },
  { keys: ['Esc'], label: 'Clear the selection or search' },
  { keys: ['L'], label: 'Switch between the table and the list' },
  { keys: ['V'], label: 'Switch view: steward or owner' },
  { keys: ['N'], label: 'Propose a metric in the Lab' },
  { keys: ['?'], label: 'This cheat sheet' },
];

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 divide-y divide-[var(--line)]" data-testid="shortcut-sheet">
        {KEYS.map((k) => (
          <div key={k.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <dt className="text-fg">{k.label}</dt>
            <dd className="m-0 flex shrink-0 gap-1">
              {k.keys.map((x) => (
                <Kbd key={x}>{x}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

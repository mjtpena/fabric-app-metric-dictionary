import { Caption } from '../components/bits';
import { FinishSwatch, type Finish } from '../components/element';
import { rules } from '../config';
import { limits } from '../model';

const FINISHES: { finish: Finish; label: string; text: string }[] = [
  { finish: 'solid', label: 'Solid', text: 'Approved by a steward. The definition to rely on.' },
  { finish: 'outlined', label: 'Outlined', text: 'In review. A steward who does not own it will approve it or send it back.' },
  { finish: 'hatched', label: 'Hatched', text: 'Draft. The owner is still writing it.' },
  { finish: 'faded', label: 'Faded', text: 'Deprecated. Kept in the deprecated series with a link to what it decays into.' },
];

export function AboutPage() {
  const t = rules.searchTiers;
  return (
    <article className="max-w-[880px]">
      <p className="x-legend-label m-0 text-[11px] text-muted">About</p>
      <h1 className="x-serif m-0 mt-1 text-[44px] leading-[1.05] tracking-[-0.02em] max-md:text-[34px]">One definition per metric</h1>
      <p className="m-0 mt-4 max-w-[64ch] text-[17px] leading-7 text-fg">
        Metric Dictionary is one searchable place where every business metric has an owner, a plain-English definition, the exact formula in
        business words and the name of the measure that implements it. Stewards approve each version, and the full history stays on the
        metric, so “which revenue number is right?” has one answer.
      </p>

      <section className="mt-10" aria-labelledby="read-h">
        <Caption id="read-h">Reading the table</Caption>
        <p className="m-0 max-w-[64ch] text-sm leading-6 text-muted">
          Each metric is an element. Its number is the order it was created, its two-letter symbol comes from its name (and is unique), its
          group is its business domain, and the corner shows its version, like an atomic mass. The two biggest groups stand at the edges;
          deprecated elements sit in a series underneath.
        </p>
        <dl className="m-0 mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {FINISHES.map((f) => (
            <div key={f.finish} className="flex items-start gap-3">
              <FinishSwatch finish={f.finish} hue="gray" size={22} />
              <div>
                <dt className="text-sm font-semibold">{f.label}</dt>
                <dd className="m-0 text-sm text-muted">{f.text}</dd>
              </div>
            </div>
          ))}
        </dl>
        <p className="m-0 mt-4 max-w-[64ch] text-sm leading-6 text-muted">
          Lenses re-colour the same table by domain, status, owner or freshness (days since the last change). Keys 1 to 4 switch lenses, L
          switches to the list, V switches between the steward’s and the owner’s view, and ? shows every shortcut.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="tools-h">
        <Caption id="tools-h">Tools</Caption>
        <dl className="m-0 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Tool term="Element card">The full metric: definition, formula, measure, isotopes (versions) with tracked changes, and the review trail.</Tool>
          <Tool term="Lab">Propose a metric. It starts as a draft at v{rules.firstVersion}; duplicates are flagged as you type, and exact names are blocked.</Tool>
          <Tool term="Peer review">The stewards’ queue, oldest first, with tracked changes against the approved version for re-reviews.</Tool>
          <Tool term="Export">The approved elements as a printable poster, a Markdown table or a CSV.</Tool>
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="rules-h">
        <Caption id="rules-h">Rules</Caption>
        <ul className="m-0 max-w-[68ch] space-y-2 pl-5 text-sm leading-6">
          <li>Names are unique, ignoring case and surrounding spaces. A duplicate is blocked with a link to the existing metric.</li>
          <li>Only the owner edits, submits and deprecates a metric. Only a steward who does not own it can approve it or request changes.</li>
          <li>
            Every save that changes the definition, formula or measure is kept as an isotope. Editing an approved metric creates the next minor
            version (1.0 to 1.1) and sends it back for review, while the approved version stays visible. Name, domain, synonyms and model edits
            are not versioned.
          </li>
          <li>If a metric changed after you opened the Lab, saving warns you first. If you confirm, your save wins.</li>
          <li>
            Search ranks any name match above any synonym match, then measure-name matches, then definition and formula matches (weights {t.name},{' '}
            {t.synonym}, {t.measure}, {t.definition}). Within a field, an exact match beats a prefix, a word start, then a partial match.
          </li>
          <li>
            Limits: name {limits.name.min}–{limits.name.max} characters, definition and formula up to {limits.definition.max}, measure name{' '}
            {limits.measureName.max}, synonyms {limits.synonyms.max}, change note {limits.changeNote.max}, review comment {limits.reviewComment.max}.
          </li>
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="roles-h">
        <Caption id="roles-h">Roles and privacy</Caption>
        <ul className="m-0 max-w-[68ch] space-y-2 pl-5 text-sm leading-6">
          <li>Everyone signed in can search and read every metric, its history and its review comments.</li>
          <li>Metric owners create metrics and maintain their own.</li>
          <li>
            Stewards are app admins (Person.isAdmin, set by the deployer with one SQL statement). A steward who owns a metric needs another
            steward to review it.
          </li>
          <li>
            Everything is visible to everyone who can open the app, with owner and reviewer names. Keep definitions free of confidential figures.
            The app stores its data in the app’s Fabric SQL database and does not read your semantic models. Sign-in uses your Fabric (Microsoft
            Entra ID) account.
          </li>
        </ul>
      </section>

      <p className="m-0 mt-10 text-xs text-muted">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps (preview).</p>
    </article>
  );
}

function Tool({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold">{term}</dt>
      <dd className="m-0 mt-0.5 text-sm text-muted">{children}</dd>
    </div>
  );
}

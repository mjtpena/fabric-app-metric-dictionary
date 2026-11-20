/**
 * Word-level diff: longest common subsequence over word tokens.
 * Words and punctuation marks are tokens; whitespace is kept as the token's leading space so the output reads like
 * the source text. Comparison is exact (case-sensitive), so "Revenue" -> "revenue" shows as a change.
 */

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffPart {
  op: DiffOp;
  /** Whitespace that came before this run in its source text (render it outside any highlight). */
  lead: string;
  /** The run's text, with the original spacing between its tokens. */
  text: string;
  /** Number of word tokens in the run (punctuation excluded). */
  words: number;
}

interface Token {
  text: string;
  lead: string;
}

const TOKEN = /(\s*)([\p{L}\p{N}_]+(?:['’.][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_])/gu;

/** Split text into word and punctuation tokens, each remembering the whitespace before it. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of (text ?? '').matchAll(TOKEN)) out.push({ lead: m[1], text: m[2] });
  return out;
}

const isWord = (t: string) => /[\p{L}\p{N}]/u.test(t);

/** Above this many cells the LCS table would be too big; fall back to a whole-text replace. */
const MAX_CELLS = 1_000_000;

/** Diff two texts word by word. Deletions come before additions where both happen at the same place. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const ops: { op: DiffOp; tok: Token }[] = [];

  if ((n + 1) * (m + 1) > MAX_CELLS) {
    for (const tok of a) ops.push({ op: 'del', tok });
    for (const tok of b) ops.push({ op: 'add', tok });
  } else {
    // lcs[i][j] = LCS length of a[i..] and b[j..], stored row-major in one typed array.
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] =
          a[i].text === b[j].text ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i].text === b[j].text) {
        // Keep the new text's spacing for unchanged words.
        ops.push({ op: 'same', tok: b[j] });
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
        ops.push({ op: 'del', tok: a[i++] });
      } else {
        ops.push({ op: 'add', tok: b[j++] });
      }
    }
    while (i < n) ops.push({ op: 'del', tok: a[i++] });
    while (j < m) ops.push({ op: 'add', tok: b[j++] });
  }

  // Within each changed stretch, group all deletions before all additions so a replaced phrase reads
  // "old words" then "new words" instead of interleaving.
  const ordered: typeof ops = [];
  for (let k = 0; k < ops.length; ) {
    if (ops[k].op === 'same') {
      ordered.push(ops[k++]);
      continue;
    }
    const dels: typeof ops = [];
    const adds: typeof ops = [];
    while (k < ops.length && ops[k].op !== 'same') (ops[k].op === 'del' ? dels : adds).push(ops[k++]);
    ordered.push(...dels, ...adds);
  }

  const parts: DiffPart[] = [];
  for (const { op, tok } of ordered) {
    const last = parts[parts.length - 1];
    if (last && last.op === op) {
      last.text += tok.lead + tok.text;
      if (isWord(tok.text)) last.words++;
    } else {
      // A run that follows a different run still needs a separating space if either side had one.
      parts.push({ op, lead: tok.lead, text: tok.text, words: isWord(tok.text) ? 1 : 0 });
    }
  }
  // Make sure adjacent del/add runs are visually separated even when the source had no space between them.
  for (let k = 1; k < parts.length; k++) {
    if (parts[k].op !== 'same' && parts[k - 1].op !== 'same' && parts[k].lead === '' && isWord(parts[k].text[0] ?? '')) {
      parts[k].lead = ' ';
    }
  }
  return parts;
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: boolean;
}

export function diffStats(parts: DiffPart[]): DiffStats {
  let added = 0;
  let removed = 0;
  let changed = false;
  for (const p of parts) {
    if (p.op === 'add') {
      added += p.words;
      changed = true;
    } else if (p.op === 'del') {
      removed += p.words;
      changed = true;
    }
  }
  return { added, removed, changed };
}

/** Plain-text rendering for tests and screen-reader summaries: [+added+] and [-removed-]. */
export function diffToText(parts: DiffPart[]): string {
  return parts
    .map((p) => p.lead + (p.op === 'add' ? `[+${p.text}+]` : p.op === 'del' ? `[-${p.text}-]` : p.text))
    .join('')
    .trim();
}

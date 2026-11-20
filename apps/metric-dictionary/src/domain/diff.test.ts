import { diffStats, diffToText, diffWords, tokenize } from './diff';

describe('tokenize', () => {
  it('splits words and punctuation and keeps leading spaces', () => {
    expect(tokenize('Net revenue, after returns.')).toEqual([
      { lead: '', text: 'Net' },
      { lead: ' ', text: 'revenue' },
      { lead: '', text: ',' },
      { lead: ' ', text: 'after' },
      { lead: ' ', text: 'returns' },
      { lead: '', text: '.' },
    ]);
  });
  it('keeps decimals, apostrophes and underscores inside one token', () => {
    expect(tokenize("customer's 2.5 net_sales").map((t) => t.text)).toEqual(["customer's", '2.5', 'net_sales']);
  });
  it('returns nothing for empty text', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('diffWords', () => {
  it('reports no change for identical text', () => {
    const parts = diffWords('Sum of net sales', 'Sum of net sales');
    expect(parts).toHaveLength(1);
    expect(parts[0].op).toBe('same');
    expect(diffStats(parts)).toEqual({ added: 0, removed: 0, changed: false });
  });

  it('marks added words', () => {
    const parts = diffWords('Sum of sales', 'Sum of net sales');
    expect(diffToText(parts)).toBe('Sum of [+net+] sales');
    expect(diffStats(parts)).toEqual({ added: 1, removed: 0, changed: true });
  });

  it('marks removed words', () => {
    const parts = diffWords('Sum of all invoiced sales', 'Sum of sales');
    expect(diffToText(parts)).toBe('Sum of [-all invoiced-] sales');
    expect(diffStats(parts).removed).toBe(2);
  });

  it('shows a replaced word as removed then added', () => {
    expect(diffToText(diffWords('Count of open orders', 'Count of shipped orders'))).toBe(
      'Count of [-open-] [+shipped+] orders',
    );
  });

  it('handles punctuation changes and case changes', () => {
    expect(diffToText(diffWords('Revenue, net', 'revenue net'))).toBe('[-Revenue,-] [+revenue+] net');
  });

  it('handles empty before or after', () => {
    expect(diffToText(diffWords('', 'New text'))).toBe('[+New text+]');
    expect(diffToText(diffWords('Old text', ''))).toBe('[-Old text-]');
    expect(diffWords('', '')).toEqual([]);
  });

  it('keeps the longest common subsequence of words', () => {
    const parts = diffWords('a b c d e f', 'a x c d y f');
    expect(diffToText(parts)).toBe('a [-b-] [+x+] c d [-e-] [+y+] f');
    expect(diffStats(parts)).toEqual({ added: 2, removed: 2, changed: true });
  });

  it('keeps line breaks from the new text', () => {
    expect(diffToText(diffWords('Sum of sales\nby month', 'Sum of sales\nby week'))).toBe(
      'Sum of sales\nby [-month-] [+week+]',
    );
  });

  it('copes with maximum-length texts', () => {
    const long = Array.from({ length: 160 }, (_, i) => `w${i}`).join(' ');
    const edited = long.replace('w80', 'changed');
    const stats = diffStats(diffWords(long, edited));
    expect(stats).toEqual({ added: 1, removed: 1, changed: true });
  });
});

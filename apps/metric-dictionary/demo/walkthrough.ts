import type { DemoScript } from '@x10/shared/demo';

type H = Parameters<DemoScript['scenes'][number]['run']>[0];

const tile = (h: H, symbol: string) => h.page.locator(`[data-testid="element-tile"][data-symbol="${symbol}"]`);
const lens = (h: H, name: RegExp) => h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name });

export const script: DemoScript = {
  title: 'Metric Dictionary: the periodic table of metrics',
  persona: 'demo-steward',
  scenes: [
    {
      id: 'hook',
      say: [
        'Every team has three versions of revenue, and nobody knows which one the dashboard uses.',
        'Metric Dictionary lays every metric out as a periodic table: one element per metric, grouped by business domain.',
        'The finish is the status: solid is approved, outlined is in review, hatched is a draft, and faded is deprecated.',
      ],
      async run(h) {
        await h.goto('/', 'demo-steward');
        await h.pause(2500);
        await h.hover(tile(h, 'Re'));
        await h.spotlight(h.page.getByTestId('table-key'), 3500);
        await h.hover(tile(h, 'Gm'));
        await h.pause(1200);
        await h.hover(tile(h, 'Ac'));
        await h.pause(1200);
        await h.hover(tile(h, 'Lc'));
        await h.pause(2500);
      },
    },
    {
      id: 'lenses',
      say: ['Lenses re-colour the same table: by status, by owner, and by freshness, the days since each metric last changed.'],
      async run(h) {
        await h.click(lens(h, /Status/));
        await h.pause(2200);
        await h.click(lens(h, /Owner/));
        await h.pause(2200);
        await h.click(lens(h, /Freshness/));
        await h.pause(2500);
      },
    },
    {
      id: 'today',
      say: [
        'The Today panel ranks what needs a steward. Gross Margin version 1.1 would change an approved metric.',
        'One click focuses that element and opens a preview with its definition and formula.',
      ],
      async run(h) {
        await h.spotlight(h.page.getByRole('complementary', { name: 'Today' }), 2500);
        await h.click(h.page.getByRole('complementary', { name: 'Today' }).getByRole('button').filter({ hasText: 'Gross Margin' }));
        await h.pause(1500);
        await h.spotlight(h.page.getByTestId('element-peek'), 4000);
      },
    },
    {
      id: 'element-card',
      say: [
        'The element card holds the definition, the formula in business words, and the measure that implements it.',
        'Its isotopes are the versions, and each one opens as tracked changes against the one before.',
      ],
      async run(h) {
        await h.goto('/', 'demo-steward');
        await h.type(h.page.getByLabel('Search metrics'), 'churn');
        await h.pause(800);
        await h.click(h.page.getByTestId('search-hit').filter({ hasText: 'Customer Churn Rate' }));
        await h.click(h.page.getByTestId('element-peek').getByRole('button', { name: 'Open element card' }));
        await h.spotlight(h.page.getByTestId('metric-formula'), 2500);
        await h.spotlight(h.page.getByTestId('measure-name'), 1500);
        await h.scrollTo(h.page.getByTestId('history-list'));
        await h.click(h.page.getByTestId('history-list').getByRole('button', { name: 'Show changes' }).first());
        await h.pause(4000);
      },
    },
    {
      id: 'view-as',
      say: ['View as owner dims everything that is not yours, so Sam sees his own elements and what they need from him.'],
      async run(h) {
        await h.goto('/', 'demo-owner');
        await h.pause(1500);
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: /Steward/ }));
        await h.pause(1500);
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: /Owner/ }));
        await h.pause(2500);
      },
    },
    {
      id: 'lab',
      say: [
        'In the Lab, Sam proposes a new metric. The element preview and the duplicate check update as he types.',
        'Churned revenue overlaps with Customer Churn Rate and Revenue, so he can read those before adding another.',
        'He saves it as a draft, and it joins the table as a hatched element.',
      ],
      async run(h) {
        await h.goto('/metrics/new', 'demo-owner');
        await h.type(h.page.getByRole('textbox', { name: 'Name', exact: true }), 'Churned Revenue');
        await h.type(h.page.getByLabel('Domain'), 'Finance');
        await h.spotlight(h.page.getByTestId('lab-preview'), 2000);
        await h.spotlight(h.page.getByTestId('similar'), 3500);
        await h.fill(h.page.getByLabel('Definition'), 'Recurring revenue lost in the period from customers who cancelled, downgraded or did not renew.');
        await h.fill(h.page.getByLabel('Formula'), 'Annual recurring revenue of churned and downgraded subscriptions in the period.');
        await h.click(h.page.getByRole('button', { name: 'Create draft' }));
        await h.spotlight(h.page.getByTestId('metric-title'), 1500);
        await h.click(h.page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Table' }));
        await h.pause(1500);
        await h.hover(tile(h, 'Cr'));
        await h.spotlight(tile(h, 'Cr'), 2500);
      },
    },
    {
      id: 'peer-review',
      say: ['Stewards approve in Peer review, where a re-review shows exactly what changed since the approved version.'],
      async run(h) {
        await h.goto('/review', 'demo-steward');
        await h.click(h.page.getByRole('button', { name: 'Put Gross Margin on the bench' }));
        await h.spotlight(h.page.getByTestId('review-bench'), 4500);
      },
    },
    {
      id: 'export',
      say: ['Approved elements export as a printable poster, a Markdown table or a CSV.'],
      async run(h) {
        await h.goto('/export', 'demo-steward');
        await h.spotlight(h.page.getByTestId('poster'), 2500);
        await h.scrollTo(h.page.getByText('Reference'));
        await h.pause(2000);
      },
    },
    {
      id: 'takeaway',
      say: ['One definition per metric, one owner and one approval trail, running as a Fabric App.'],
      async run(h) {
        await h.goto('/', 'demo-steward');
        await h.pause(5000);
      },
    },
  ],
};

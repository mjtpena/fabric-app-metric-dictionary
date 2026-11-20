import type { DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { addDays } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

import type { Metric, MetricStatus, Schema } from './model';

/**
 * Fictional, generic seed: 20 metrics across Finance, Sales, People and Operations. 11 approved, 3 in review,
 * 4 drafts and 2 deprecated; Customer Churn Rate has 3 versions and ends a replacement chain
 * (Monthly Churn Count -> Logo Churn Rate -> Customer Churn Rate); Gross Margin is a re-review of an approved
 * metric (banner "v1.0 is the approved version"); Pipeline Coverage is in review and owned by a steward (who
 * cannot approve it); Active Customers was sent back with a comment; eNPS has no measure yet; Net Revenue
 * Retention has a very long definition. Dates are relative to ctx.now. No React imports: tools load this in Node.
 */

interface VersionSpec {
  version: string;
  definition?: string;
  formula?: string;
  measureName?: string | null;
  note: string;
  daysAgo: number;
}

interface ReviewSpec {
  /** Index into ctx.people. */
  by: number;
  decision: 'approve' | 'changes';
  version: string;
  comment?: string;
  daysAgo: number;
}

interface MetricSpec {
  key: string;
  name: string;
  domain: string;
  owner: number;
  definition: string;
  formula: string;
  measureName: string | null;
  modelRef: string | null;
  synonyms: string | null;
  status: MetricStatus;
  /** Oldest first. The last entry is the current content; earlier entries override definition/formula/measure. */
  versions: VersionSpec[];
  reviews?: ReviewSpec[];
  /** Version label the approvedVersionId points at. */
  approvedVersion?: string;
  submittedDaysAgo?: number;
  deprecation?: { note: string; replacedBy: string | null; daysAgo: number };
}

// People indexes match personas in app.config.ts.
const STEWARD = 0;
const STEWARD_OWNER = 1;
const SAM = 2;
const JORDAN = 3;

const FIN = 'Finance';
const SALES = 'Sales';
const PEOPLE = 'People';
const OPS = 'Operations';

const NRR_DEFINITION =
  'Net revenue retention shows how much recurring revenue we keep and grow from the customers we already had at the start of a period. ' +
  'Start with the annual recurring revenue of every customer that was active on the first day of the period. ' +
  'Add expansion from upgrades, extra seats and cross-sold products for those same customers, then subtract contraction from downgrades and discounts, and subtract the recurring revenue of customers who churned. ' +
  'Revenue from customers acquired during the period is excluded, as are one-off services, implementation fees and usage overages that are not contracted. ' +
  'Currency is converted at the budget rate for the year so that exchange movements do not show up as expansion or contraction. ' +
  'Customers that move between legal entities in a merger are treated as the same customer. ' +
  'A value above 100% means the existing base grows on its own even with no new customers.';

const specs: MetricSpec[] = [
  {
    key: 'revenue',
    name: 'Revenue',
    domain: FIN,
    owner: STEWARD_OWNER,
    definition: 'Net value of goods and services invoiced to customers in the period, after returns, credits and discounts, excluding sales tax.',
    formula: 'Sum of invoice line amounts minus credit notes and discounts, excluding tax, for invoices dated in the period.',
    measureName: '[Total Revenue]',
    modelRef: 'Finance Model',
    synonyms: 'Net sales, Turnover, Top line',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 120 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', comment: 'Matches the finance close process.', daysAgo: 115 }],
    approvedVersion: '1.0',
  },
  {
    key: 'gross-margin',
    name: 'Gross Margin',
    domain: FIN,
    owner: STEWARD_OWNER,
    definition: 'Share of revenue left after the direct cost of delivering the goods and services sold, including freight and hosting costs.',
    formula: '(Revenue minus cost of goods sold, freight and hosting) divided by revenue, for the same period.',
    measureName: '[Gross Margin %]',
    modelRef: 'Finance Model',
    synonyms: 'Gross profit margin, GM%',
    status: 'in_review',
    versions: [
      {
        version: '1.0',
        definition: 'Share of revenue left after the direct cost of the goods sold.',
        formula: '(Revenue minus cost of goods sold) divided by revenue, for the same period.',
        note: 'Created',
        daysAgo: 100,
      },
      { version: '1.1', note: 'Include freight and hosting in direct costs', daysAgo: 3 },
    ],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 96 }],
    approvedVersion: '1.0',
    submittedDaysAgo: 3,
  },
  {
    key: 'dso',
    name: 'Days Sales Outstanding',
    domain: FIN,
    owner: STEWARD_OWNER,
    definition: 'Average number of days it takes to collect payment after an invoice is issued.',
    formula: 'Accounts receivable at period end divided by revenue for the period, multiplied by the number of days in the period.',
    measureName: '[DSO]',
    modelRef: 'Finance Model',
    synonyms: 'DSO, Debtor days, Collection period',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 90 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 88 }],
    approvedVersion: '1.0',
  },
  {
    key: 'arr',
    name: 'Annual Recurring Revenue',
    domain: FIN,
    owner: SAM,
    definition: 'Annualised value of all active subscription contracts on the last day of the period.',
    formula: 'Sum of monthly recurring revenue of active subscriptions on the last day of the period, multiplied by 12.',
    measureName: '[ARR]',
    modelRef: 'Sales Model',
    synonyms: 'ARR, Subscription revenue run rate',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 80 }],
    reviews: [{ by: STEWARD_OWNER, decision: 'approve', version: '1.0', daysAgo: 78 }],
    approvedVersion: '1.0',
  },
  {
    key: 'bookings',
    name: 'Bookings',
    domain: SALES,
    owner: STEWARD_OWNER,
    definition: 'Total contract value of new and expansion deals signed in the period, whether or not it has been invoiced yet.',
    formula: 'Sum of total contract value for opportunities marked closed-won with a signature date in the period.',
    measureName: '[Bookings TCV]',
    modelRef: 'Sales Model',
    synonyms: 'Contracted revenue, TCV signed',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 70 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 66 }],
    approvedVersion: '1.0',
  },
  {
    key: 'win-rate',
    name: 'Win Rate',
    domain: SALES,
    owner: SAM,
    definition: 'Share of qualified opportunities that end as won deals, counted in the period the opportunity closed.',
    formula: 'Closed-won opportunities divided by all closed opportunities (won plus lost) in the period.',
    measureName: '[Win Rate %]',
    modelRef: 'Sales Model',
    synonyms: 'Close rate, Conversion rate',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 60 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', comment: 'Clear and testable.', daysAgo: 58 }],
    approvedVersion: '1.0',
  },
  {
    key: 'pipeline-coverage',
    name: 'Pipeline Coverage',
    domain: SALES,
    owner: STEWARD_OWNER,
    definition: 'How many times the open, qualified pipeline covers the remaining sales target for the quarter.',
    formula: 'Value of open qualified opportunities expected to close this quarter divided by the quarter target minus bookings to date.',
    measureName: '[Pipeline Coverage x]',
    modelRef: 'Sales Model',
    synonyms: 'Pipeline-to-target ratio',
    status: 'in_review',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 6 }],
    submittedDaysAgo: 5,
  },
  {
    key: 'nrr',
    name: 'Net Revenue Retention',
    domain: SALES,
    owner: SAM,
    definition: NRR_DEFINITION,
    formula:
      '(Starting ARR of the period cohort + expansion - contraction - churned ARR) divided by starting ARR of the same cohort.',
    measureName: '[NRR %]',
    modelRef: 'Sales Model',
    synonyms: 'NRR, Net dollar retention',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 50 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 47 }],
    approvedVersion: '1.0',
  },
  {
    key: 'monthly-churn',
    name: 'Monthly Churn Count',
    domain: SALES,
    owner: SAM,
    definition: 'Number of customers who cancelled in the month.',
    formula: 'Count of customers with a cancellation date in the month.',
    measureName: '[Churned Customers]',
    modelRef: 'Sales Model',
    synonyms: 'Cancellations',
    status: 'deprecated',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 200 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 198 }],
    approvedVersion: '1.0',
    deprecation: {
      note: 'A raw count hides growth in the customer base. Use a rate instead.',
      replacedBy: 'logo-churn',
      daysAgo: 150,
    },
  },
  {
    key: 'logo-churn',
    name: 'Logo Churn Rate',
    domain: SALES,
    owner: SAM,
    definition: 'Share of customers at the start of the quarter who cancelled during the quarter.',
    formula: 'Customers who cancelled in the quarter divided by customers active on the first day of the quarter.',
    measureName: '[Logo Churn %]',
    modelRef: 'Sales Model',
    synonyms: 'Quarterly churn',
    status: 'deprecated',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 150 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 148 }],
    approvedVersion: '1.0',
    deprecation: {
      note: 'Merged into Customer Churn Rate, which reports monthly and quarterly from one definition.',
      replacedBy: 'churn',
      daysAgo: 40,
    },
  },
  {
    key: 'churn',
    name: 'Customer Churn Rate',
    domain: SALES,
    owner: SAM,
    definition:
      'Share of paying customers at the start of the period who cancelled or did not renew during the period. Customers paused for less than 30 days are not counted as churned.',
    formula:
      'Customers active on day one of the period who cancelled or lapsed without renewal during the period, excluding pauses under 30 days, divided by customers active on day one.',
    measureName: '[Customer Churn %]',
    modelRef: 'Sales Model',
    synonyms: 'Churn, Customer attrition, Logo churn',
    status: 'approved',
    versions: [
      {
        version: '1.0',
        definition: 'Share of customers at the start of the month who cancelled during the month.',
        formula: 'Customers who cancelled in the month divided by customers active on the first day of the month.',
        measureName: '[Churn %]',
        note: 'Created',
        daysAgo: 60,
      },
      {
        version: '1.1',
        definition: 'Share of paying customers at the start of the period who cancelled or did not renew during the period.',
        formula:
          'Customers active on day one of the period who cancelled or lapsed without renewal during the period, divided by customers active on day one.',
        measureName: '[Customer Churn %]',
        note: 'Count non-renewals and support any period, not just months',
        daysAgo: 42,
      },
      { version: '1.2', note: 'Exclude short pauses', daysAgo: 12 },
    ],
    reviews: [
      { by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 58 },
      { by: STEWARD, decision: 'approve', version: '1.1', comment: 'Replaces Logo Churn Rate.', daysAgo: 40 },
      { by: STEWARD, decision: 'changes', version: '1.2', comment: 'Say how long a pause can be before it counts.', daysAgo: 11 },
      { by: STEWARD_OWNER, decision: 'approve', version: '1.2', daysAgo: 9 },
    ],
    approvedVersion: '1.2',
  },
  {
    key: 'active-customers',
    name: 'Active Customers',
    domain: SALES,
    owner: SAM,
    definition: 'Customers who used the product in the period.',
    formula: 'Distinct count of customer accounts with at least one login in the period.',
    measureName: '[Active Customers]',
    modelRef: 'Sales Model',
    synonyms: 'Active accounts',
    status: 'draft',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 14 }],
    reviews: [
      {
        by: STEWARD,
        decision: 'changes',
        version: '1.0',
        comment: 'Say whether trial and internal test accounts count, and whether an API call counts as use.',
        daysAgo: 8,
      },
    ],
  },
  {
    key: 'headcount',
    name: 'Headcount',
    domain: PEOPLE,
    owner: JORDAN,
    definition: 'Number of employees on the payroll on the last day of the period, counting part-time staff as one each.',
    formula: 'Distinct count of employees with an active employment record on the last day of the period. Contractors are excluded.',
    measureName: '[Headcount]',
    modelRef: 'People Model',
    synonyms: 'Employee count, Staff count',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 110 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 108 }],
    approvedVersion: '1.0',
  },
  {
    key: 'time-to-hire',
    name: 'Time to Hire',
    domain: PEOPLE,
    owner: JORDAN,
    definition: 'Median number of calendar days from a role being approved for hiring to the candidate accepting the offer.',
    formula: 'Median of (offer accepted date minus requisition approved date) for offers accepted in the period.',
    measureName: '[Median Days to Hire]',
    modelRef: 'People Model',
    synonyms: 'Days to fill, TTH',
    status: 'in_review',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 10 }],
    submittedDaysAgo: 9,
  },
  {
    key: 'attrition',
    name: 'Voluntary Attrition',
    domain: PEOPLE,
    owner: JORDAN,
    definition: 'Share of employees who chose to leave in the last 12 months, compared with average headcount over the same months.',
    formula: 'Voluntary leavers in the trailing 12 months divided by the average of month-end headcount over those months.',
    measureName: '[Voluntary Attrition %]',
    modelRef: 'People Model',
    synonyms: 'Staff turnover, Regretted leavers rate',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 95 }],
    reviews: [{ by: STEWARD_OWNER, decision: 'approve', version: '1.0', daysAgo: 92 }],
    approvedVersion: '1.0',
  },
  {
    key: 'enps',
    name: 'Employee Net Promoter Score',
    domain: PEOPLE,
    owner: JORDAN,
    definition: 'How likely employees are to recommend the company as a place to work, from the quarterly pulse survey.',
    formula: 'Percentage of promoters (9 or 10) minus percentage of detractors (0 to 6) among survey responses.',
    measureName: null,
    modelRef: null,
    synonyms: 'eNPS',
    status: 'draft',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 4 }],
  },
  {
    key: 'otd',
    name: 'On-Time Delivery',
    domain: OPS,
    owner: JORDAN,
    definition: 'Share of customer orders delivered on or before the date promised at order confirmation.',
    formula: 'Orders delivered on or before the promised date divided by all orders delivered in the period.',
    measureName: '[OTD %]',
    modelRef: 'Operations Model',
    synonyms: 'OTD, Delivery performance',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 85 }],
    reviews: [{ by: STEWARD, decision: 'approve', version: '1.0', daysAgo: 83 }],
    approvedVersion: '1.0',
  },
  {
    key: 'fill-rate',
    name: 'Order Fill Rate',
    domain: OPS,
    owner: JORDAN,
    definition: 'Share of ordered units shipped in full from stock on the first shipment.',
    formula: 'Units shipped on the first shipment divided by units ordered, for orders shipped in the period.',
    measureName: '[Fill Rate %]',
    modelRef: 'Operations Model',
    synonyms: 'Fill rate, In-full rate',
    status: 'approved',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 75 }],
    reviews: [{ by: STEWARD_OWNER, decision: 'approve', version: '1.0', daysAgo: 73 }],
    approvedVersion: '1.0',
  },
  {
    key: 'inventory-turns',
    name: 'Inventory Turns',
    domain: OPS,
    owner: JORDAN,
    definition: 'How many times the average inventory is sold and replaced over a year.',
    formula: 'Cost of goods sold for the trailing 12 months divided by average month-end inventory value.',
    measureName: '[Inventory Turns]',
    modelRef: 'Operations Model',
    synonyms: 'Stock turnover',
    status: 'draft',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 2 }],
  },
  {
    key: 'fcr',
    name: 'First Contact Resolution',
    domain: OPS,
    owner: SAM,
    definition: 'Share of support cases solved in the first interaction, with no follow-up contact within seven days.',
    formula: 'Cases closed after one interaction and not reopened within 7 days, divided by all cases closed in the period.',
    measureName: '[FCR %]',
    modelRef: 'Operations Model',
    synonyms: 'FCR, One-touch resolution',
    status: 'draft',
    versions: [{ version: '1.0', note: 'Created', daysAgo: 1 }],
  },
];

export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const at = (daysAgo: number) => addDays(ctx.now, -daysAgo);
  const person = (i: number): Person => ctx.people[i] ?? ctx.people[0];
  const ids = new Map<string, string>();
  const created: { spec: MetricSpec; metric: Metric }[] = [];

  for (const spec of specs) {
    const owner = person(spec.owner);
    const first = spec.versions[0];
    const last = spec.versions[spec.versions.length - 1];
    const updatedDaysAgo = Math.min(
      last.daysAgo,
      ...(spec.reviews ?? []).map((r) => r.daysAgo),
      spec.submittedDaysAgo ?? Infinity,
      spec.deprecation?.daysAgo ?? Infinity,
    );
    const metric = await store.repo('Metric').create({
      name: spec.name,
      domain: spec.domain,
      definition: spec.definition,
      formula: spec.formula,
      measureName: spec.measureName,
      modelRef: spec.modelRef,
      synonyms: spec.synonyms,
      ownerName: owner.displayName,
      ownerSub: owner.sub,
      status: spec.status,
      version: last.version,
      replacedById: null,
      approvedVersionId: null,
      deprecationNote: spec.deprecation?.note ?? null,
      submittedAt: spec.submittedDaysAgo !== undefined ? at(spec.submittedDaysAgo) : null,
      createdAt: at(first.daysAgo),
      updatedAt: at(updatedDaysAgo),
    });
    ids.set(spec.key, metric.id);
    created.push({ spec, metric });

    let approvedVersionId: string | null = null;
    for (const v of spec.versions) {
      const row = await store.repo('MetricVersion').create({
        metricId: metric.id,
        version: v.version,
        definition: v.definition ?? spec.definition,
        formula: v.formula ?? spec.formula,
        measureName: v.measureName !== undefined ? v.measureName : spec.measureName,
        changedBy: owner.displayName,
        changedBySub: owner.sub,
        changedAt: at(v.daysAgo),
        changeNote: v.note,
      });
      if (v.version === spec.approvedVersion) approvedVersionId = row.id;
    }
    for (const r of spec.reviews ?? []) {
      const reviewer = person(r.by);
      await store.repo('Review').create({
        metricId: metric.id,
        versionLabel: r.version,
        reviewerSub: reviewer.sub,
        reviewerName: reviewer.displayName,
        decision: r.decision,
        comment: r.comment ?? null,
        createdAt: at(r.daysAgo),
      });
    }
    if (approvedVersionId) await store.repo('Metric').update(metric.id, { approvedVersionId });
  }

  for (const { spec, metric } of created) {
    const target = spec.deprecation?.replacedBy;
    if (target) await store.repo('Metric').update(metric.id, { replacedById: ids.get(target) ?? null });
  }
}

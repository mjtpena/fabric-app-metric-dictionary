/**
 * App data types and runtime entity definitions. Keep these in step with rayfin/data/*.ts:
 * every field listed here must exist on the entity class with the matching decorator.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

/** The same numbers as the @text({ min, max }) decorators on the entities. */
export const limits = {
  name: { min: 3, max: 80 },
  domain: { min: 2, max: 60 },
  definition: { min: 10, max: 1000 },
  formula: { min: 3, max: 1000 },
  measureName: { max: 120 },
  modelRef: { max: 150 },
  synonyms: { max: 300 },
  changeNote: { max: 300 },
  deprecationNote: { min: 5, max: 300 },
  reviewComment: { max: 500 },
} as const;

export const METRIC_STATUSES = ['draft', 'in_review', 'approved', 'deprecated'] as const;
export type MetricStatus = (typeof METRIC_STATUSES)[number];

export const REVIEW_DECISIONS = ['approve', 'changes'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface Metric {
  id: string;
  name: string;
  domain: string;
  definition: string;
  formula: string;
  measureName: string | null;
  modelRef: string | null;
  /** Comma list, such as "ARR, Subscription revenue". */
  synonyms: string | null;
  ownerName: string;
  ownerSub: string;
  status: MetricStatus;
  /** "1.0", "1.1", … */
  version: string;
  replacedById: string | null;
  approvedVersionId: string | null;
  deprecationNote: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MetricVersion {
  id: string;
  metricId: string;
  version: string;
  definition: string;
  formula: string;
  measureName: string | null;
  changedBy: string;
  changedBySub: string;
  changedAt: string;
  changeNote: string | null;
}

export interface Review {
  id: string;
  metricId: string;
  versionLabel: string;
  reviewerSub: string;
  reviewerName: string;
  decision: ReviewDecision;
  comment: string | null;
  createdAt: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Metric: Metric;
  MetricVersion: MetricVersion;
  Review: Review;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Metric: {
    name: 'Metric',
    fields: {
      id: 'uuid',
      name: 'text',
      domain: 'text',
      definition: 'text',
      formula: 'text',
      measureName: 'text',
      modelRef: 'text',
      synonyms: 'text',
      ownerName: 'text',
      ownerSub: 'text',
      status: 'set',
      version: 'text',
      replacedById: 'uuid',
      approvedVersionId: 'uuid',
      deprecationNote: 'text',
      submittedAt: 'date',
      createdAt: 'date',
      updatedAt: 'date',
    },
  },
  MetricVersion: {
    name: 'MetricVersion',
    fields: {
      id: 'uuid',
      metricId: 'uuid',
      version: 'text',
      definition: 'text',
      formula: 'text',
      measureName: 'text',
      changedBy: 'text',
      changedBySub: 'text',
      changedAt: 'date',
      changeNote: 'text',
    },
  },
  Review: {
    name: 'Review',
    fields: {
      id: 'uuid',
      metricId: 'uuid',
      versionLabel: 'text',
      reviewerSub: 'text',
      reviewerName: 'text',
      decision: 'set',
      comment: 'text',
      createdAt: 'date',
    },
  },
};

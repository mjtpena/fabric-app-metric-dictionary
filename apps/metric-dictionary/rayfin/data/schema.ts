import { AppMarker } from './AppMarker.js';
import { Metric } from './Metric.js';
import { MetricVersion } from './MetricVersion.js';
import { Person } from './Person.js';
import { Review } from './Review.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Metric: Metric;
  MetricVersion: MetricVersion;
  Review: Review;
};

export const schema = [Person, AppMarker, Metric, MetricVersion, Review];

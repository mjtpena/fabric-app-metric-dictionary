/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

/**
 * Demo personas (order matters: the seed assigns owners and reviewers by index).
 * - Morgan: steward (admin) who owns no metrics, the default viewer.
 * - Priya: steward who also owns metrics, so she cannot approve her own (Pipeline Coverage).
 * - Sam and Jordan: metric owners without steward rights.
 */
export const personas: Persona[] = [
  { sub: 'demo-steward', name: 'Morgan Lee', email: 'morgan@example.com', isAdmin: true, role: 'Steward' },
  { sub: 'demo-steward-owner', name: 'Priya Shah', email: 'priya@example.com', isAdmin: true, role: 'Steward + owner' },
  { sub: 'demo-owner', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Metric owner' },
  { sub: 'demo-owner-2', name: 'Jordan Kim', email: 'jordan@example.com', isAdmin: false, role: 'Metric owner' },
];

export const config: AppConfig<Schema> = {
  appId: 'metric-dictionary',
  title: 'Metric Dictionary',
  tagline: 'One definition per metric, one owner, one approval trail.',
  defs,
  personas,
  seed,
  accent: 'plum',
  // Phone tab-bar icons are added in main.tsx so this file stays JSX-free.
  // An element tile: a square with a two-letter symbol stroke and the atomic-number tick in the corner.
  logoPaths: ['M4.5 4.5h15v15h-15z', 'M7.5 7.5h2.5', 'M9.5 16.5V11a2.25 2.25 0 0 1 4.5 0v5.5', 'M9.5 13.5H14', 'M16.5 16.5v-3.5'],
  nav: [
    { to: '/', label: 'Table', end: true },
    { to: '/metrics/new', label: 'Lab' },
    { to: '/review', label: 'Peer review', adminOnly: true },
    { to: '/export', label: 'Export' },
    { to: '/about', label: 'About' },
  ],
};

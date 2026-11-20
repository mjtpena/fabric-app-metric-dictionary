import type { ReactNode } from 'react';
import { Atom, Download, FlaskConical, Info, Stamp } from 'lucide-react';

import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

const ICONS: Record<string, ReactNode> = {
  '/': <Atom />,
  '/metrics/new': <FlaskConical />,
  '/review': <Stamp />,
  '/export': <Download />,
  '/about': <Info />,
};

mountApp({ ...config, nav: config.nav.map((n) => ({ ...n, icon: ICONS[n.to] })) }, <App />);

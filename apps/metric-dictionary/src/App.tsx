import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { EditorPage } from './pages/EditorPage';
import { ExportPage } from './pages/ExportPage';
import { MetricPage } from './pages/MetricPage';
import { ReviewPage } from './pages/ReviewPage';
import { TablePage } from './pages/TablePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell immersive><TablePage /></AppShell>} />
      <Route path="/metrics/new" element={<AppShell><EditorPage /></AppShell>} />
      <Route path="/metrics/:id" element={<AppShell><MetricPage /></AppShell>} />
      <Route path="/metrics/:id/edit" element={<AppShell><EditorPage /></AppShell>} />
      <Route path="/review" element={<AppShell wide><ReviewPage /></AppShell>} />
      <Route path="/export" element={<AppShell wide><ExportPage /></AppShell>} />
      <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

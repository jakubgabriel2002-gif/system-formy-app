import * as React from 'react';
import { createRoot } from 'react-dom/client';
import AppV2 from './AppV2';
import './v2.css';

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root.');
createRoot(root).render(
  <React.StrictMode>
    <AppV2 />
  </React.StrictMode>,
);

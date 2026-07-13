import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n/config.ts';
import { initializeErrorMonitoring } from './lib/errorMonitoring';

// Initialize central privacy-safe error monitoring
initializeErrorMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

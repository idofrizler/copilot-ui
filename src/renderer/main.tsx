import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import './styles/global.css';
import { initTelemetry } from './utils/telemetry';
import buildInfo from './build-info.json';

// Initialize telemetry (no PII, just usage patterns)
// Only active for packaged/distributed apps, not development builds
initTelemetry(buildInfo.baseVersion, buildInfo.gitBranch);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { TimezoneProvider } from './hooks/useTimezone';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TimezoneProvider>
      <App />
    </TimezoneProvider>
  </React.StrictMode>
);

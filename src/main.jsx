import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LDProvider } from 'launchdarkly-react-client-sdk';
import './index.css';
import App from './App.jsx';
import { LD_CLIENT_ID } from './lib/launchdarkly.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LDProvider
      clientSideID={LD_CLIENT_ID}
      context={{ kind: 'user', anonymous: true }}
      options={{ streaming: true }}
    >
      <App />
    </LDProvider>
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

// Self-hosted rather than linked from a font CDN: the content security policy
// allows no font origin, and a brand typeface that silently falls back to
// system-ui is not the brand.
import '@fontsource-variable/archivo';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element — index.html is wrong.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

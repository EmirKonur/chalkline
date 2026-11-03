import '@fontsource-variable/nunito/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/board.css';
import './styles/pages.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { applyTheme, themeStore } from './theme/theme.ts';

applyTheme(themeStore.get().theme);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

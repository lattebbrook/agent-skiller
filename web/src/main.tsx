import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { ToastProvider } from './shared/Toast.js';
import './styles.css';
import { initTheme } from './shared/theme.js';

initTheme();
import { useSkillStore } from './store/skillStore.js';
import { useWorkspaceStore } from './store/workspaceStore.js';

// Handy in the browser console and for driving the app from tests: window.__skiller.skill.getState()
(window as unknown as { __skiller: unknown }).__skiller = { skill: useSkillStore, workspace: useWorkspaceStore };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);

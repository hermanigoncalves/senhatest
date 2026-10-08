import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ErrorBoundary, FatalScreen } from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));

// O App é carregado dinamicamente para que uma configuração ausente (Supabase) apareça como mensagem,
// em vez de uma página em branco.
import('./V1App.jsx')
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  })
  .catch((e) => {
    console.error('[boot]', e);
    root.render(<FatalScreen message={e?.message || 'Falha ao carregar o aplicativo.'} />);
  });

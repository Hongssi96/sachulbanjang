import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import ConnectedTabletApp from '../src/pages/Connected/ConnectedTabletApp';
import AuthProvider from '../src/hooks/AuthProvider';
import '../src/styles/global.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ConnectedTabletApp />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);

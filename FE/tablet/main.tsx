import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import TabletHomePage from '../src/pages/TabletHomePage/TabletHomePage';
import '../src/styles/global.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <TabletHomePage />
    </HashRouter>
  </React.StrictMode>,
);

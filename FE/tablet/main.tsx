import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import ConnectedTabletApp from '../src/pages/Connected/ConnectedTabletApp';
import AuthProvider from '../src/hooks/AuthProvider';
import PageEntry from '../src/components/PageEntry/PageEntry';
import TabletLoading from '../src/components/TabletLoading/TabletLoading';
import { TABLET_LOADING_FINISH_MS } from '../src/components/TabletLoading/TabletLoading.constants';
import '../src/styles/global.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <PageEntry
          manageTablet
          finishDelayMs={TABLET_LOADING_FINISH_MS}
          loading={<TabletLoading fullScreen />}
        >
          <ConnectedTabletApp />
        </PageEntry>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);

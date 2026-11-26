import { Fragment, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import AuthLoading from '../AuthLoading/AuthLoading';
import { usePageContentLoading } from './PageEntryContext';

export default function PageContent({
  children,
  loading: loadingElement,
}: {
  children: ReactNode;
  loading?: ReactNode;
}) {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const loading = usePageContentLoading();
  return (
    <>
      <div className="page-entry-content" hidden={loading}>
        <Suspense fallback={null}>
          <Fragment key={pathname}>{children}</Fragment>
        </Suspense>
      </div>
      {loading && (
        <div className="page-entry-local-loading">
          {loadingElement ?? <AuthLoading label="화면을 준비하고 있어요" />}
        </div>
      )}
    </>
  );
}

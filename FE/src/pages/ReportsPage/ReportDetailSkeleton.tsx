import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import './ReportsPage.css';
import './ReportDetailSkeleton.css';

export default function ReportDetailSkeleton() {
  return (
    <section className="reports-page rpd-page rpd-skeleton" aria-busy="true">
      <Link className="rpd-back" to="/reports">
        <ArrowLeft size={16} />
        목록으로
      </Link>
      <span className="sr-only" role="status">
        보고를 불러오는 중이에요
      </span>
      <div className="rpd-article" aria-hidden="true">
        <div className="rpd-header">
          <div className="rpd-tags">
            <span className="rpd-skeleton-block rpd-skeleton-tag" />
            <span className="rpd-skeleton-block rpd-skeleton-tag" />
          </div>
          <div className="rpd-skeleton-block rpd-skeleton-title" />
          <div className="rpd-meta">
            <span className="rpd-skeleton-block rpd-skeleton-date" />
            <span className="rpd-skeleton-block rpd-skeleton-views" />
          </div>
        </div>
        <div className="rpd-layout">
          <div className="rpd-primary">
            <div className="rpd-skeleton-lines rpd-skeleton-body">
              <span className="rpd-skeleton-block" />
              <span className="rpd-skeleton-block" />
              <span className="rpd-skeleton-block" />
              <span className="rpd-skeleton-block" />
              <span className="rpd-skeleton-block" />
              <span className="rpd-skeleton-block" />
            </div>
            <div className="rpd-request rpd-skeleton-request">
              <span className="rpd-skeleton-block rpd-skeleton-label" />
              <div className="rpd-skeleton-lines">
                <span className="rpd-skeleton-block" />
                <span className="rpd-skeleton-block" />
                <span className="rpd-skeleton-block" />
              </div>
            </div>
          </div>
          <div className="rpd-side">
            <div className="rpd-summary">
              <span className="rpd-skeleton-block rpd-skeleton-label" />
              <div className="rpd-skeleton-lines">
                <span className="rpd-skeleton-block" />
                <span className="rpd-skeleton-block" />
                <span className="rpd-skeleton-block" />
              </div>
            </div>
            <div className="rpd-status-card">
              <span className="rpd-skeleton-block rpd-skeleton-label" />
              <div className="rpd-status-group">
                <span className="rpd-skeleton-block rpd-skeleton-button" />
                <span className="rpd-skeleton-block rpd-skeleton-button" />
                <span className="rpd-skeleton-block rpd-skeleton-button" />
              </div>
              <span className="rpd-skeleton-block rpd-skeleton-button rpd-pdf" />
            </div>
          </div>
        </div>
      </div>
      <div className="rpd-nav" aria-hidden="true">
        <span className="rpd-skeleton-block rpd-skeleton-neighbor" />
        <span className="rpd-skeleton-block rpd-skeleton-neighbor" />
      </div>
    </section>
  );
}

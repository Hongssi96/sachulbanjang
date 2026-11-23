import type { ReactNode } from 'react';
import { CalendarDays, RotateCcw, TriangleAlert } from 'lucide-react';
import './QueryFilterCard.css';

interface QueryFilterCardProps {
  title?: string;
  /** 제목 오른쪽의 빠른 기간 선택 등 */
  presets?: ReactNode;
  onReset: () => void;
  error?: string;
  caption?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function QueryFilterCard({
  title = '조회 조건',
  presets,
  onReset,
  error,
  caption,
  className = '',
  children,
}: QueryFilterCardProps) {
  return (
    <section
      className={`card query-filter-card${className ? ` ${className}` : ''}`}
      aria-label={`${title} 필터`}
    >
      <div className="query-filter-head">
        <strong>
          <CalendarDays size={18} />
          {title}
        </strong>
        <div className="query-filter-actions">
          {presets}
          <button type="button" className="query-filter-reset" onClick={onReset}>
            <RotateCcw size={14} />
            초기화
          </button>
        </div>
      </div>
      <div className="query-filter-fields">{children}</div>
      {error && (
        <div className="query-filter-error" role="alert">
          <TriangleAlert size={17} />
          <span>{error}</span>
          <button type="button" onClick={onReset}>
            초기화
          </button>
        </div>
      )}
      {caption && <p className="query-filter-caption">{caption}</p>}
    </section>
  );
}

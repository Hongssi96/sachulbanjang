import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { fetchReport } from '../../../api/reports';
import type { ReportListItem, ReportStatus } from '../../../api/reports';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { formatDateTime } from '../../../utils/dateFormat';
import { highlightMatches } from '../searchHighlight';
import { reportPreview } from './reportPreview';
import './ReportSearchResult.css';

const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};

interface ReportSearchResultProps {
  report: ReportListItem;
  query: string;
}

export default function ReportSearchResult({ report, query }: ReportSearchResultProps) {
  const card = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = card.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { data, error } = useApiQuery(
    `chat-search-report-preview:${report.report_id}:${report.version}`,
    () => fetchReport(report.report_id),
    { enabled: visible },
  );

  return (
    <article ref={card} className="cs-result cs-report-result">
      <FileText size={18} />
      <div>
        <strong>{highlightMatches(report.title, query)}</strong>
        <p className="cs-report-preview">
          {error
            ? '미리보기를 불러오지 못했어요.'
            : data
              ? highlightMatches(reportPreview(data.body_markdown, query), query)
              : '보고 내용을 불러오는 중이에요…'}
        </p>
        <small>
          {report.author_display_name} · {formatDateTime(report.created_at)} ·{' '}
          {REPORT_STATUS_LABELS[report.business_status]}
        </small>
      </div>
    </article>
  );
}

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ClipboardList, Download, Eye, FileText } from 'lucide-react';
import {
  changeReportStatus,
  fetchReport,
  fetchReports,
  type ReportCategory,
  type ReportStatus,
} from '../../api/reports';
import { apiRequestBlob } from '../../api/client';
import ApiErrorState from '../../components/ApiErrorState';
import LoadingState from '../../components/LoadingState';
import { setReportChecklist, useReportChecklist } from '../../services/reportChecklist';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatDateTime } from '../../utils/dateFormat';
import './ReportsPage.css';

type StatusLabel = '대기' | '진행 중' | '완료';

const statusOptions: StatusLabel[] = ['대기', '진행 중', '완료'];
const statusToLabel: Record<ReportStatus, StatusLabel> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};
const labelToStatus: Record<StatusLabel, ReportStatus> = {
  대기: 'pending',
  '진행 중': 'in_progress',
  완료: 'completed',
};
const statusPill: Record<StatusLabel, string> = {
  대기: 'pill-amber',
  '진행 중': 'pill-violet',
  완료: 'pill-green',
};
const categoryLabels: Record<ReportCategory, string> = {
  equipment_issue: '설비 이상',
  quality_report: '품질 보고',
  inspection_done: '점검 완료',
  periodic_weekly: '주간 보고',
  periodic_monthly: '월간 보고',
  other: '기타',
};
// 저장된 체크 상태가 없으면 처리 상태에 맞는 기본값으로 시작한다.
function defaultChecklist(status: StatusLabel, length: number): boolean[] {
  if (status === '완료') return Array.from({ length }, () => true);
  if (status === '진행 중') return Array.from({ length }, (_, index) => index === 0);
  return Array.from({ length }, () => false);
}

export default function ReportDetailPage() {
  const { reportId } = useParams();
  const id = Number(reportId);
  const validId = Number.isInteger(id) && id >= 1;
  const detailQuery = useApiQuery(`report:${id}`, () => fetchReport(id), { enabled: validId });
  // 이전·다음 글은 목록에서 현재 위치로 계산한다.
  const listQuery = useApiQuery('report-neighbors', () => fetchReports({ pageSize: 100 }), {
    enabled: validId,
  });
  const storedChecklist = useReportChecklist(reportId ?? '');
  const [statusError, setStatusError] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const post = detailQuery.data;
  const items = listQuery.data?.items ?? [];
  const index = items.findIndex((item) => item.report_id === id);
  const newer = index > 0 ? items[index - 1] : null;
  const older = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const checklist = useMemo(
    () =>
      (post?.body_markdown ?? '')
        .split('\n')
        .filter((line) => /^\s*[-*]\s+/.test(line))
        .map((line) => line.replace(/^\s*[-*]\s+/, '')),
    [post],
  );
  const currentStatus = post ? statusToLabel[post.business_status] : '대기';
  const checked =
    storedChecklist?.length === checklist.length
      ? storedChecklist
      : defaultChecklist(currentStatus, checklist.length);
  const completedCount = checked.filter(Boolean).length;

  const toggleItem = (target: number) => {
    if (!post) return;
    const next = checked.map((value, itemIndex) => (itemIndex === target ? !value : value));
    setReportChecklist(String(post.report_id), next);
  };
  const changeStatus = async (option: StatusLabel) => {
    if (!post) return;
    setSaving(true);
    setStatusError('');
    try {
      await changeReportStatus(post.report_id, post.version, labelToStatus[option]);
      detailQuery.reload();
    } catch (error: unknown) {
      setStatusError(error instanceof Error ? error.message : '상태를 변경하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!post) return;
    setDownloading(true);
    setStatusError('');
    try {
      const blob = await apiRequestBlob(`/reports/${post.report_id}/pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `report-${post.report_id}-v${post.version}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      setStatusError(error instanceof Error ? error.message : 'PDF를 내려받지 못했어요.');
    } finally {
      setDownloading(false);
    }
  };

  if (!validId || (!detailQuery.loading && !post)) {
    return (
      <section className="reports-page">
        <div className="rp-empty">
          <FileText size={34} />
          <strong>보고를 찾을 수 없어요</strong>
          <p>삭제되었거나 잘못된 주소입니다.</p>
          <Link className="button button-primary" to="/reports">
            목록으로 돌아가기
          </Link>
        </div>
      </section>
    );
  }
  if (detailQuery.loading && !post) {
    return (
      <section className="reports-page">
        <LoadingState label="보고를 불러오는 중이에요" />
      </section>
    );
  }
  if (detailQuery.error || !post) {
    return (
      <section className="reports-page">
        <ApiErrorState
          error={detailQuery.error ?? new Error('보고를 불러오지 못했어요.')}
          onRetry={detailQuery.reload}
        />
      </section>
    );
  }

  return (
    <section className="reports-page rpd-page">
      <Link className="rpd-back" to="/reports">
        <ArrowLeft size={16} />
        목록으로
      </Link>
      <article className="rpd-article">
        <header className="rpd-header">
          <div className="rpd-tags">
            <span className="rp-category">{categoryLabels[post.category]}</span>
            <span className={`pill ${statusPill[currentStatus]}`}>{currentStatus}</span>
          </div>
          <h1>{post.title}</h1>
          <div className="rpd-meta">
            <span>{formatDateTime(post.created_at)}</span>
            <i />
            <span>
              <Eye size={13} /> —
            </span>
          </div>
        </header>
        <div className="rpd-layout">
          <div className="rpd-primary">
            <div className="rpd-body">
              {post.body_markdown.split('\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
            <section className="rpd-request" aria-label="요청 사항">
              <div className="rpd-request-head">
                <h2>
                  <ClipboardList size={16} />
                  요청 사항
                </h2>
                <span className="rpd-request-count">
                  {completedCount}/{checklist.length} 완료
                </span>
              </div>
              {checklist.length ? (
                <ul className="rpd-checklist">
                  {checklist.map((item, itemIndex) => (
                    <li key={`${item}-${itemIndex}`}>
                      <label className={checked[itemIndex] ? 'is-done' : undefined}>
                        <input
                          type="checkbox"
                          checked={checked[itemIndex]}
                          onChange={() => toggleItem(itemIndex)}
                        />
                        <span>{item}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rt-empty">
                  요청 사항은 서버에서 제공하지 않아요. 본문에 ‘- 항목’ 형식으로 적으면 이곳에서
                  확인할 수 있어요.
                </p>
              )}
            </section>
          </div>
          <aside className="rpd-side">
            <section className="rpd-summary" aria-label="작성자 및 설비 정보">
              <h2>작성자 · 설비</h2>
              <dl>
                <div>
                  <dt>작성자</dt>
                  <dd>{post.author_display_name}</dd>
                </div>
                <div>
                  <dt>설비</dt>
                  <dd>—</dd>
                </div>
                <div>
                  <dt>등록</dt>
                  <dd>{formatDateTime(post.created_at)}</dd>
                </div>
              </dl>
            </section>
            <section className="rpd-status-card" aria-label="처리 상태 변경">
              <span className="rpd-status-label">처리 상태</span>
              <div className="rpd-status-group" role="group">
                {statusOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-status={option}
                    className={option === currentStatus ? 'current' : undefined}
                    aria-pressed={option === currentStatus}
                    disabled={saving}
                    onClick={() => void changeStatus(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="button button-white rpd-pdf"
                disabled={downloading}
                onClick={() => void downloadPdf()}
              >
                <Download size={15} /> {downloading ? 'PDF 준비 중…' : 'PDF 다운로드'}
              </button>
              {statusError && (
                <p className="rt-empty" role="alert">
                  {statusError}
                </p>
              )}
            </section>
          </aside>
        </div>
      </article>
      <nav className="rpd-nav" aria-label="이전·다음 보고">
        {newer ? (
          <Link to={`/reports/${newer.report_id}`}>
            <small>이전 글</small>
            <strong>{newer.title}</strong>
          </Link>
        ) : (
          <span />
        )}
        {older ? (
          <Link className="next" to={`/reports/${older.report_id}`}>
            <small>다음 글</small>
            <strong>{older.title}</strong>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </section>
  );
}

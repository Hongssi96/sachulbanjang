import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Check, Download, FileText, LoaderCircle } from 'lucide-react';
import { apiRequestBlob } from '../../api/client';
import {
  changeReportStatus,
  fetchReport,
  type ReportCategory,
  type ReportStatus,
} from '../../api/reports';
import { date, errorMessage } from '../../api/business';
import useRemote from '../../hooks/useRemote';
import { useAuth } from '../../hooks/useAuth';
import { setReportChecklist, useReportChecklist } from '../../services/reportChecklist';
import { RemoteState } from './LiveShared';

const categoryLabels: Record<ReportCategory, string> = {
  equipment_issue: '설비 이상',
  quality_report: '품질 보고',
  inspection_done: '검사 완료',
  periodic_weekly: '주간 보고',
  periodic_monthly: '월간 보고',
  other: '기타',
};
const statusLabels: Record<ReportStatus, string> = {
  pending: '접수 대기',
  in_progress: '확인 중',
  completed: '처리 완료',
};
const statusOptions: ReportStatus[] = ['pending', 'in_progress', 'completed'];

function checklistOf(body: string) {
  return body
    .split('\n')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}

export default function LiveReportDetail() {
  const { reportId } = useParams();
  const { user } = useAuth();
  const id = Number(reportId);
  const validId = Number.isInteger(id) && id >= 1;
  const detail = useRemote(
    useCallback(
      () => (validId ? fetchReport(id) : Promise.reject(new Error('잘못된 보고서 주소입니다.'))),
      [validId, id],
    ),
  );
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const report = detail.data;
  const checklist = useMemo(() => (report ? checklistOf(report.body_markdown) : []), [report]);
  const storedChecklist = useReportChecklist(reportId ?? '');
  const checked =
    storedChecklist?.length === checklist.length
      ? storedChecklist
      : checklist.map(() => report?.business_status === 'completed');
  const completedCount = checked.filter(Boolean).length;

  function toggleChecklist(index: number) {
    if (!report) return;
    const next = checked.map((value, itemIndex) => (itemIndex === index ? !value : value));
    setReportChecklist(String(report.report_id), next);
  }

  async function changeStatus(status: ReportStatus) {
    if (!report || saving) return;
    setSaving(true);
    setActionError('');
    try {
      await changeReportStatus(report.report_id, report.version, status);
      detail.reload();
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!report || downloading) return;
    setDownloading(true);
    setActionError('');
    try {
      const blob = await apiRequestBlob(`/reports/${report.report_id}/pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `report-${report.report_id}-v${report.version}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="live-page live-report-detail-page">
      <div className="live-toolbar">
        <div>
          <Link className="live-report-back" to="/reports">
            <ArrowLeft size={16} /> 목록으로
          </Link>
          <h1>이상 보고 상세</h1>
        </div>
        {report ? (
          <button
            className="button button-white live-report-pdf"
            disabled={downloading}
            onClick={() => void downloadPdf()}
          >
            {downloading ? (
              <LoaderCircle className="is-spinning" size={16} />
            ) : (
              <Download size={16} />
            )}
            {downloading ? 'PDF 준비 중' : 'PDF 다운로드'}
          </button>
        ) : null}
      </div>

      <RemoteState {...detail} retry={detail.reload} />

      {report ? (
        <article className="live-card live-report-detail">
          <div className="live-report-tags">
            <span className="live-badge">{categoryLabels[report.category]}</span>
            <span className={`live-report-status ${report.business_status}`}>
              {statusLabels[report.business_status]}
            </span>
          </div>
          <h2>{report.title}</h2>
          <p className="live-muted live-report-meta">
            <FileText size={14} /> {report.author_display_name} · {date(report.created_at)} · v
            {report.version}
          </p>

          <p className="live-body live-report-body">{report.body_markdown}</p>

          <section className="live-report-checklist-section" aria-label="요청 사항">
            <div className="live-report-section-head">
              <h3>요청 사항</h3>
              <span>
                {completedCount}/{checklist.length} 완료
              </span>
            </div>
            {checklist.length ? (
              <ul className="live-report-checklist">
                {checklist.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <label className={checked[index] ? 'is-done' : undefined}>
                      <input
                        type="checkbox"
                        checked={checked[index]}
                        onChange={() => toggleChecklist(index)}
                      />
                      <span>{item}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="live-muted">
                본문에 ‘- 항목’ 형식으로 작성하면 요청 사항으로 확인할 수 있습니다.
              </p>
            )}
          </section>

          {user?.role === 'admin' ? (
            <section className="live-report-status-section" aria-label="처리 상태 변경">
              <h3>처리 상태</h3>
              <div className="live-report-status-group">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={status === report.business_status ? 'current' : undefined}
                    aria-pressed={status === report.business_status}
                    disabled={saving}
                    onClick={() => void changeStatus(status)}
                  >
                    {status === report.business_status ? <Check size={14} /> : null}
                    {statusLabels[status]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {actionError ? (
            <p className="live-error" role="alert">
              {actionError}
            </p>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

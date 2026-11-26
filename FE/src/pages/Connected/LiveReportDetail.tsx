import { usePageEntryReady } from '../../components/PageEntry/PageEntryContext';
import { Fragment, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import ReportDetailSkeleton from '../ReportsPage/ReportDetailSkeleton';

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

function inlineParts(value: string): ReactNode[] {
  return value
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      return <Fragment key={index}>{part}</Fragment>;
    });
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function Markdown({ body }: { body: string }) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const content = inlineParts(heading[2]);
      const level = heading[1].length;
      blocks.push(
        level === 1 ? (
          <h1 key={key++}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={key++}>{content}</h2>
        ) : level === 3 ? (
          <h3 key={key++}>{content}</h3>
        ) : (
          <h4 key={key++}>{content}</h4>
        ),
      );
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inlineParts(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inlineParts(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (
      line.trim().startsWith('|') &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1])
    ) {
      const header = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="live-report-table-wrap" key={key++}>
          <table>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex}>{inlineParts(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{inlineParts(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={key++} />);
      index += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !lines[index].trim().startsWith('|') &&
      !/^\s*---+\s*$/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) {
      blocks.push(<p key={key++}>{inlineParts(paragraph.join(' '))}</p>);
    } else {
      blocks.push(<p key={key++}>{inlineParts(line.trim())}</p>);
      index += 1;
    }
  }

  return <div className="live-report-markdown">{blocks}</div>;
}

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
  usePageEntryReady(!detail.loading);
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

  if (detail.loading && !report) return <ReportDetailSkeleton />;

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

          <Markdown body={report.body_markdown} />

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

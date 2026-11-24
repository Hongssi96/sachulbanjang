import { useCallback } from 'react';
import { Link } from 'react-router';
import { ArrowRight, NotebookPen } from 'lucide-react';
import useRemote from '../../hooks/useRemote';
import { useAuth } from '../../hooks/useAuth';
import { date, list, read, text } from '../../api/business';
import { Metrics, RemoteState, Table } from './LiveShared';
import LiveCollection from './LiveCollection';

export default function LiveDashboard({ tablet = false }: { tablet?: boolean }) {
  const { user } = useAuth();
  const resource = useRemote(
    useCallback(
      async () => ({
        quality: await read('/quality/summary'),
        equipment: await list('/equipment'),
        reports: await list('/reports?page_size=5'),
      }),
      [],
    ),
  );
  return (
    <div className="live-page">
      <div className="live-toolbar">
        <h1>좋은 하루예요, {user?.display_name}님.</h1>
        <button className="button button-white" onClick={resource.reload}>
          새로고침
        </button>
      </div>
      <RemoteState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <Metrics
            values={[
              ['검사 기록', text(resource.data.quality.inspected_count)],
              ['검사 불량', text(resource.data.quality.defect_count)],
              [
                '검사 불량률',
                resource.data.quality.defect_rate === null
                  ? '—'
                  : `${text(resource.data.quality.defect_rate)}%`,
              ],
              ['등록 설비', `${resource.data.equipment.total}대`],
            ]}
          />
          <div className={`live-home-pair${tablet ? ' is-split' : ''}`}>
            <section className="live-card live-home-reports">
              <div className="live-toolbar">
                <h2>올라온 보고</h2>
                <Link to="/reports">전체 보기 →</Link>
              </div>
              {tablet ? (
                resource.data.reports.items.length ? (
                  <ul className="live-home-report-list">
                    {resource.data.reports.items.slice(0, 4).map((row, index) => (
                      <li key={`${text(row.report_id)}-${index}`}>
                        <strong>{text(row.title)}</strong>
                        <small>
                          {text(row.author_display_name)} · {date(row.created_at)}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="live-home-report-empty">올라온 보고가 없습니다.</p>
                )
              ) : (
                <Table
                  rows={resource.data.reports.items}
                  columns={[
                    ['title', '제목'],
                    ['author_display_name', '작성자'],
                    ['created_at', '일시', (row) => date(row.created_at)],
                  ]}
                />
              )}
            </section>
            {tablet ? (
              <section className="live-card live-handover-cta">
                <span className="live-handover-cta-icon">
                  <NotebookPen size={26} />
                </span>
                <div>
                  <span className="live-handover-eyebrow">SHIFT HANDOVER</span>
                  <h2>인수인계</h2>
                  <p className="live-muted">
                    교대 근무 인수인계를 확인하고 다음 근무자에게 전달할 내용을 남겨 주세요.
                  </p>
                </div>
                <Link className="button button-primary" to="/handover">
                  인수인계 열기 <ArrowRight size={16} />
                </Link>
              </section>
            ) : null}
          </div>
        </>
      )}
      {!tablet && <LiveCollection kind="handover-notes" />}
    </div>
  );
}

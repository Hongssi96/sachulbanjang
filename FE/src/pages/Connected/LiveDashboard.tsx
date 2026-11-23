import { useCallback } from 'react';
import { Link } from 'react-router';
import useRemote from '../../hooks/useRemote';
import { useAuth } from '../../hooks/useAuth';
import { date, list, read, text } from '../../api/business';
import { Metrics, RemoteState, Table } from './LiveShared';
import LiveCollection from './LiveCollection';

export default function LiveDashboard() {
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
          <section className="live-card">
            <div className="live-toolbar">
              <h2>올라온 보고</h2>
              <Link to="/reports">전체 보기 →</Link>
            </div>
            <Table
              rows={resource.data.reports.items}
              columns={[
                ['title', '제목'],
                ['author_display_name', '작성자'],
                ['created_at', '일시', (row) => date(row.created_at)],
              ]}
            />
          </section>
        </>
      )}
      <LiveCollection kind="handover-notes" />
    </div>
  );
}

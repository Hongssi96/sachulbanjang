import { formatNumber } from '../../utils/numberFormat';
import { Link } from 'react-router';
import { fetchProcessRecords } from '../../api/records';
import ApiErrorState from '../../components/ApiErrorState';
import LoadingState from '../../components/LoadingState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatDateTime } from '../../utils/dateFormat';

interface MachineProductionRecordsProps {
  equipmentId: number;
  date: string;
  cycleTimeLabel: string;
}

export default function MachineProductionRecords({
  equipmentId,
  date,
  cycleTimeLabel,
}: MachineProductionRecordsProps) {
  const { data, error, loading, reload } = useApiQuery(
    `machine-production-records:${equipmentId}:${date}`,
    () =>
      fetchProcessRecords({
        equipmentId,
        from: date,
        to: date,
        page: 1,
        pageSize: 5,
      }),
    { pollMs: 30_000 },
  );

  return (
    <>
      <dl className="metric-stats" aria-busy={loading}>
        <div>
          <dt>오늘 생산 기록</dt>
          <dd>{data ? `${formatNumber(data.pagination.total_items)}건` : '—'}</dd>
        </div>
        <div>
          <dt>사이클 타임</dt>
          <dd>{cycleTimeLabel}</dd>
        </div>
        <div>
          <dt>마지막 점검</dt>
          <dd>—</dd>
        </div>
      </dl>
      <section className="metric-section" aria-label="오늘 생산 기록">
        <div className="metric-section-head">
          <h3>오늘 생산 기록</h3>
          {data && <span className="muted">최근 {data.items.length}건 · 한국 시간 기준</span>}
        </div>
        {error && <ApiErrorState compact error={error} onRetry={reload} />}
        {loading && !data ? (
          <LoadingState compact label="설비 생산 기록을 불러오는 중이에요" />
        ) : data?.items.length ? (
          <ul className="metric-events">
            {data.items.map((record) => (
              <li key={record.record_id}>
                <time
                  className="metric-event-time"
                  dateTime={record.occurred_at}
                  title={formatDateTime(record.occurred_at)}
                >
                  {formatDateTime(record.occurred_at).slice(-5)}
                </time>
                <span className="pill pill-neutral">생산</span>
                <div className="metric-event-message">
                  <Link to={`/records/${record.record_id}?view=production`}>
                    {record.product_name ?? '제품 미지정'} · 기록 {record.record_id}
                  </Link>
                  {record.is_demo && <small> · 시연 데이터</small>}
                </div>
              </li>
            ))}
          </ul>
        ) : data && !error ? (
          <p className="metric-empty">오늘 이 설비에 등록된 생산 기록이 없어요.</p>
        ) : null}
      </section>
    </>
  );
}

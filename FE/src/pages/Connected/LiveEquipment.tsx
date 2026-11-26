import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import useRemote from '../../hooks/useRemote';
import { date, items, list, read, text } from '../../api/business';
import { RemoteState, Table } from './LiveShared';

export default function LiveEquipment({ tablet = false }: { tablet?: boolean }) {
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(filter), 300);
    return () => window.clearTimeout(timer);
  }, [filter]);
  const resource = useRemote(
    useCallback(
      async () => ({ master: await list('/equipment'), current: await read('/process/current') }),
      [],
    ),
  );
  useEffect(() => {
    const timer = window.setInterval(resource.reload, 30000);
    return () => window.clearInterval(timer);
  }, [resource.reload]);
  const current = resource.data ? items(resource.data.current) : [];
  const rows =
    resource.data?.master.items.map((equipment) => ({
      ...equipment,
      ...current.find((row) => row.equipment_id === equipment.equipment_id),
    })) ?? [];
  const visibleRows = rows.filter((row) =>
    `${text(row.equipment_code)} ${text(row.name)}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="live-page">
      {!tablet && (
        <div className="live-toolbar">
          <h1>설비 현황 · 실시간 공정</h1>
        </div>
      )}
      <RemoteState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          {!tablet && (
            <>
              <p className="live-muted">
                조회 {date(resource.data.current.queried_at)} · 데이터 기준{' '}
                {date(resource.data.current.data_time)} · 30초마다 갱신
              </p>
              <p className="live-muted">
                이 API는 가동 상태·온도·압력·생산 목표를 제공하지 않습니다. 확인되지 않은 수치를
                정상 상태로 표시하지 않습니다.
              </p>
            </>
          )}
          <div className="live-equipment-search">
            <label>
              <span>설비 검색</span>
              <input
                value={filter}
                placeholder="설비명 또는 설비 코드 검색"
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
            <button
              className="button button-white live-refresh-button"
              type="button"
              aria-label="새로고침"
              title="새로고침"
              onClick={resource.reload}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <section className="live-card live-table-card">
            <Table
              rows={visibleRows}
              columns={[
                [
                  'equipment_code',
                  '설비',
                  tablet
                    ? (row) => (
                        <span className="live-table-ordinal">
                          <span className="live-table-ordinal-number">
                            {visibleRows.indexOf(row) + 1}
                          </span>
                          {text(row.equipment_code)}
                        </span>
                      )
                    : undefined,
                ],
                ['name', '설비명'],
                ['product_name', '현재 제품'],
                ['cycle_time_seconds', '최근 사이클(초)'],
                ['occurred_at', '기록 시각', (row) => date(row.occurred_at)],
                ['equipment_status', '가동 상태', () => '미확인'],
              ]}
            />
          </section>
          {resource.data.current.replay_state && (
            <p className="live-muted">
              공정 재생 상태: {text(resource.data.current.replay_state)} ·{' '}
              {current.some((row) => row.is_demo) ? '시연 데이터 포함' : '서버 기록'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

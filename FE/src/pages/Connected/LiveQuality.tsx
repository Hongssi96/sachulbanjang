import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import useRemote from '../../hooks/useRemote';
import { number, query, read, text } from '../../api/business';
import { Metrics, RemoteState } from './LiveShared';

export default function LiveQuality() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const resource = useRemote(
    useCallback(() => read(query('/quality/summary', { from, to })), [from, to]),
  );
  const summary = resource.data;
  return (
    <div className="live-page">
      <h1>품질 리포트</h1>
      <div className="live-card live-filters">
        <label>
          시작일
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          종료일 (미포함)
          <input
            type="date"
            min={from}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button className="button button-white" onClick={resource.reload}>
          새로고침
        </button>
      </div>
      <RemoteState {...resource} retry={resource.reload} />
      {summary && (
        <>
          <Metrics
            values={[
              ['검사 기록', text(summary.inspected_count)],
              ['검사 양품', text(summary.good_count)],
              ['검사 불량', text(summary.defect_count)],
              ['검사 불량률', summary.defect_rate === null ? '—' : `${text(summary.defect_rate)}%`],
            ]}
          />
          <section className="live-card">
            <h2>불량 유형 분포</h2>
            {Array.isArray(summary.defect_types) && summary.defect_types.length ? (
              summary.defect_types.map((value, index) => {
                const row =
                  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
                return (
                  <div className="live-bar" key={index}>
                    <span>{row.type ? text(row.type) : '미분류'}</span>
                    <progress
                      max={Math.max(1, number(summary.defect_count))}
                      value={number(row.count)}
                    />
                    <strong>{text(row.count)}건</strong>
                  </div>
                );
              })
            ) : (
              <p className="live-empty">불량 기록이 없습니다.</p>
            )}
          </section>
          <p className="live-muted">
            생산 기록 {text(summary.production_record_count)}건 ·{' '}
            {summary.includes_demo ? '시연 데이터 포함' : '서버 기록 기준'}. 전체 생산 불량률이 아닌
            검사 기록 기준 통계입니다.
          </p>
          <Link className="button button-white" to="/records?kind=inspection">
            검사 이력 확인
          </Link>
        </>
      )}
    </div>
  );
}

import { CircleCheck, TriangleAlert } from 'lucide-react';
import ApiErrorState from '../../components/ApiErrorState';
import LoadingState from '../../components/LoadingState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { fetchInspectionRecord } from '../../api/records';
import type { InspectionRecord } from '../../api/records';
import {
  NA,
  qualityDateLabel,
  qualityVerdict,
  recordEquipmentLabel,
  recordProductLabel,
  seoulDateTime,
} from './qualityReportModel';

export function InspectionDetail({ record }: { record: InspectionRecord }) {
  const defect = record.verdict === 'defect';
  const { date, time } = seoulDateTime(record.inspected_at);
  return (
    <div className="qr-detail">
      <span className={`pill ${defect ? 'qr-pill-danger' : 'pill-green'}`}>
        {defect ? <TriangleAlert size={14} /> : <CircleCheck size={14} />}
        {qualityVerdict(record)}
      </span>
      <h3>{recordProductLabel(record)} 검사 기록</h3>
      <p className="qr-detail-meta">
        #{record.record_id}
        <br />
        {date === NA ? NA : `${qualityDateLabel(date)} ${time}`} · {recordEquipmentLabel(record)} ·
        담당 {NA}
      </p>
      <div className="qr-detail-values">
        <div>
          <span>검사 수량</span>
          <strong>{NA}</strong>
        </div>
        <div>
          <span>불량 수량</span>
          <strong>{NA}</strong>
        </div>
        <div>
          <span>검사 불량률</span>
          <strong>{NA}</strong>
        </div>
      </div>
      <h4>기록된 불량 유형</h4>
      {defect ? (
        <dl className="qr-detail-defects">
          <div>
            <dt>{record.defect_type ?? '미분류'}</dt>
            <dd>1건</dd>
          </div>
          {record.reason && (
            <div>
              <dt>사유</dt>
              <dd>{record.reason}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="empty-text">이 검사 기록에는 불량이 기록되지 않았어요.</p>
      )}
      <div className="modal-callout">
        <strong>다음 확인 사항</strong>
        <p>
          {defect
            ? '불량이 기록된 제품의 공정 조건과 이전 조치 이력을 함께 비교해 주세요. 검사 결과만으로 불량 원인을 확정할 수 없습니다.'
            : '해당 기록의 판정과 시각을 확인해 주세요. 다른 기간·제품의 품질 상태를 의미하지 않습니다.'}
        </p>
      </div>
      <p className="qr-detail-footnote">
        검사 기록 1건 단위로 표시하며, 검사 수량·담당자처럼 API가 제공하지 않는 값은 —로 표시합니다.
      </p>
    </div>
  );
}

export function InspectionDetailDialog({ recordId }: { recordId: number }) {
  const query = useApiQuery(`quality:inspection:${recordId}`, () =>
    fetchInspectionRecord(recordId),
  );
  if (query.loading && !query.data)
    return <LoadingState compact label="검사 기록을 불러오는 중이에요" />;
  if (query.error) return <ApiErrorState error={query.error} onRetry={query.reload} />;
  if (!query.data) return <p className="empty-text">기록 없음</p>;
  return <InspectionDetail record={query.data} />;
}

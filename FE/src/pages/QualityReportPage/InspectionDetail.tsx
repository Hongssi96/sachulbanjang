import { CircleCheck, TriangleAlert } from 'lucide-react';
import {
  defectCount,
  defectTypes,
  formatRate,
  percentage,
  qualityDateLabel,
  qualityVerdict,
} from '../../services/inspectionData';
import type { InspectionBatch } from '../../services/inspectionData';
export default function InspectionDetail({ record }: { record: InspectionBatch }) {
  const defects = defectCount(record);
  return (
    <div className="qr-detail">
      <span className={`pill ${defects ? 'pill-amber' : 'pill-green'}`}>
        {defects ? <TriangleAlert size={14} /> : <CircleCheck size={14} />}
        {qualityVerdict(record)}
      </span>
      <h3>{record.product} 검사 배치</h3>
      <p className="qr-detail-meta">
        {record.id}
        <br />
        {qualityDateLabel(record.date)} {record.time} · {record.equipment} · 담당 {record.inspector}
      </p>
      <div className="qr-detail-values">
        <div>
          <span>검사 수량</span>
          <strong>
            {record.inspected.toLocaleString()}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>불량 수량</span>
          <strong>
            {defects}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>검사 불량률</span>
          <strong>{formatRate(percentage(defects, record.inspected))}</strong>
        </div>
      </div>
      <h4>기록된 불량 유형</h4>
      {defects ? (
        <dl className="qr-detail-defects">
          {defectTypes
            .filter((type) => record.defects[type] > 0)
            .map((type) => (
              <div key={type}>
                <dt>{type}</dt>
                <dd>{record.defects[type]}개</dd>
              </div>
            ))}
        </dl>
      ) : (
        <p className="empty-text">이 검사 배치에는 불량이 기록되지 않았어요.</p>
      )}
      <div className="modal-callout">
        <strong>다음 확인 사항</strong>
        <p>
          {defects
            ? '불량이 기록된 제품의 공정 조건과 이전 조치 이력을 함께 비교해 주세요. 검사 결과만으로 불량 원인을 확정할 수 없습니다.'
            : '해당 배치의 검사 수량과 기록을 확인해 주세요. 다른 기간·제품의 품질 상태를 의미하지 않습니다.'}
        </p>
      </div>
      <p className="qr-detail-footnote">검사 배치는 여러 제품을 묶어 검사한 단위입니다.</p>
    </div>
  );
}

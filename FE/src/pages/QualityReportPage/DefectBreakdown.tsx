import { ShieldCheck } from 'lucide-react';
import type { DefectType } from '../../services/inspectionData';
const colors = ['#635B85', '#61E2A6', '#DD8296', '#A9AAB5'];
export default function DefectBreakdown({
  items,
}: {
  items: { type: DefectType; count: number }[];
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const circumference = 2 * Math.PI * 58;
  if (!total)
    return (
      <div className="qr-empty qr-no-defects">
        <ShieldCheck size={36} />
        <strong>불량 기록이 없어요</strong>
        <p>선택한 검사 배치에 불량이 기록되지 않았습니다.</p>
      </div>
    );
  return (
    <div className="qr-breakdown">
      <svg
        viewBox="0 0 164 164"
        className="qr-donut"
        role="img"
        aria-label={`불량 ${total}개 유형별 분포. ${items.map((item) => `${item.type} ${item.count}개`).join(', ')}`}
      >
        <circle cx="82" cy="82" r="58" fill="none" stroke="var(--soft)" strokeWidth="18" />
        {items.map((item, index) => (
          <circle
            key={item.type}
            cx="82"
            cy="82"
            r="58"
            fill="none"
            stroke={colors[index]}
            strokeWidth="18"
            strokeDasharray={`${(item.count / total) * circumference} ${circumference}`}
            strokeDashoffset={
              (-items.slice(0, index).reduce((sum, value) => sum + value.count, 0) / total) *
              circumference
            }
            transform="rotate(-90 82 82)"
          >
            <title>
              {item.type} · {item.count}개
            </title>
          </circle>
        ))}
        <text x="82" y="82" textAnchor="middle" className="qr-donut-value">
          {total.toLocaleString()}
        </text>
        <text x="82" y="105" textAnchor="middle" className="qr-donut-label">
          불량 수량
        </text>
      </svg>
      <div className="qr-defect-legend">
        {items.map((item, index) => (
          <div key={item.type}>
            <span>
              <i style={{ background: colors[index] }} />
              {item.type}
            </span>
            <strong>
              {item.count}
              <small>개</small>
            </strong>
            <span>{((item.count / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

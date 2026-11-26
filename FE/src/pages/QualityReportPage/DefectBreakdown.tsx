import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import { ShieldCheck } from 'lucide-react';
// 불량 유형별 색: 가스(주의) · 찍힘(고장) · 휘어짐(Primary) · 미성형(미가동)
const colors = ['#F2BB69', '#D95F70', '#635B85', '#A9AAB5'];
export default function DefectBreakdown({ items }: { items: { type: string; count: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const circumference = 2 * Math.PI * 58;
  if (!total)
    return (
      <div className="qr-empty qr-no-defects">
        <ShieldCheck size={36} />
        <strong>불량 기록이 없어요</strong>
        <p>선택한 검사 기록에 불량이 기록되지 않았습니다.</p>
      </div>
    );
  return (
    <div className="qr-breakdown">
      <svg
        viewBox="0 0 164 164"
        className="qr-donut"
        role="img"
        aria-label={`불량 ${total}건 유형별 분포. ${items.map((item) => `${item.type} ${item.count}건`).join(', ')}`}
      >
        <circle cx="82" cy="82" r="58" fill="none" stroke="var(--soft)" strokeWidth="18" />
        {items.map((item, index) => (
          <circle
            key={item.type}
            cx="82"
            cy="82"
            r="58"
            fill="none"
            stroke={colors[index % colors.length]}
            strokeWidth="18"
            strokeDasharray={`${(item.count / total) * circumference} ${circumference}`}
            strokeDashoffset={
              (-items.slice(0, index).reduce((sum, value) => sum + value.count, 0) / total) *
              circumference
            }
            transform="rotate(-90 82 82)"
          >
            <title>
              {item.type} · {item.count}건
            </title>
          </circle>
        ))}
        <text x="82" y="82" textAnchor="middle" className="qr-donut-value">
          {formatNumber(total)}
        </text>
        <text x="82" y="105" textAnchor="middle" className="qr-donut-label">
          불량 수량
        </text>
      </svg>
      <div className="qr-defect-legend">
        {items.map((item, index) => (
          <div key={item.type}>
            <span>
              <i style={{ background: colors[index % colors.length] }} />
              {item.type}
            </span>
            <strong>
              {item.count}
              <small>건</small>
            </strong>
            <span>{formatDecimal((item.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

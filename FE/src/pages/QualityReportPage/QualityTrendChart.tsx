import { inspectionThreshold } from '../../services/inspectionData';
interface TrendPoint {
  date: string;
  rate: number | null;
  inspected: number;
  defective: number;
}
export default function QualityTrendChart({ points }: { points: TrendPoint[] }) {
  const step = Math.max(
    1,
    Math.ceil(
      (Math.max(inspectionThreshold, ...points.map((point) => point.rate ?? 0)) * 1.15) / 4,
    ),
  );
  const max = step * 4;
  const x = (index: number) =>
    points.length === 1 ? 375 : 52 + (index * 646) / (points.length - 1);
  const y = (value: number) => 210 - (value / max) * 174;
  const line = points.map((point, index) => `${x(index)},${y(point.rate ?? 0)}`).join(' ');
  const area = points.length
    ? `M${x(0)},210 L${line.replaceAll(' ', ' L')} L${x(points.length - 1)},210 Z`
    : '';
  return (
    <svg
      className="qr-trend-svg"
      viewBox="0 0 730 250"
      role="img"
      aria-label={`선택 기간 검사 불량률 추이. 점검 기준 ${inspectionThreshold}%. ${points.map((point) => `${point.date} ${point.rate?.toFixed(2)}%`).join(', ')}`}
    >
      <defs>
        <linearGradient id="quality-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#635B85" stopOpacity=".18" />
          <stop offset="100%" stopColor="#635B85" stopOpacity=".02" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((index) => (
        <g key={index}>
          <line
            x1="52"
            x2="698"
            y1={y(index * step)}
            y2={y(index * step)}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <text x="38" y={y(index * step) + 4} textAnchor="end">
            {index * step}%
          </text>
        </g>
      ))}
      <line
        x1="52"
        x2="698"
        y1={y(inspectionThreshold)}
        y2={y(inspectionThreshold)}
        stroke="#D6A14D"
        strokeDasharray="5 5"
      />
      <path d={area} fill="url(#quality-trend-fill)" />
      <polyline
        points={line}
        stroke="var(--primary)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <g key={point.date}>
          <circle
            cx={x(index)}
            cy={y(point.rate ?? 0)}
            r={(point.rate ?? 0) > inspectionThreshold ? 5 : 4}
            stroke="var(--surface)"
            strokeWidth="2"
            fill={(point.rate ?? 0) > inspectionThreshold ? '#F2BB69' : '#635B85'}
          >
            <title>
              {point.date} · 검사 {point.inspected}개 · 불량 {point.defective}개 ·{' '}
              {point.rate?.toFixed(2)}%
            </title>
          </circle>
          {(points.length <= 8 || index % 2 === 0 || index === points.length - 1) && (
            <text x={x(index)} y="238" textAnchor="middle">
              {point.date.slice(5).replace('-', '.')}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

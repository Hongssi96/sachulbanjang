import { useId } from 'react';

interface MetricPoint {
  label: string;
  value: number;
}
interface MetricTrendChartProps {
  title: string;
  points: MetricPoint[];
  reference: { value: number; label: string };
  seriesLabel: string;
  formatValue: (value: number) => string;
}
const WIDTH = 720;
const HEIGHT = 240;
const LEFT = 56;
const RIGHT = 16;
const TOP = 20;
const BOTTOM = 34;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
// 축 눈금이 0 / 1.5 / 3처럼 읽기 쉬운 값이 되도록 1·1.5·2·2.5·5·10 배수를 쓴다.
function niceStep(rough: number) {
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor =
    normalized <= 1
      ? 1
      : normalized <= 1.5
        ? 1.5
        : normalized <= 2
          ? 2
          : normalized <= 2.5
            ? 2.5
            : normalized <= 5
              ? 5
              : 10;
  return factor * magnitude;
}
export default function MetricTrendChart({
  title,
  points,
  reference,
  seriesLabel,
  formatValue,
}: MetricTrendChartProps) {
  const gradientId = `metric-trend-${useId().replaceAll(':', '')}`;
  if (!points.length) return <p className="metric-empty">표시할 기록이 없어요.</p>;

  const step = niceStep(Math.max(reference.value, ...points.map((point) => point.value)) / 4);
  const max = step * 4;
  const x = (index: number) =>
    points.length === 1 ? LEFT + PLOT_WIDTH / 2 : LEFT + (index * PLOT_WIDTH) / (points.length - 1);
  const y = (value: number) => TOP + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT;
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const area = `M${x(0)},${TOP + PLOT_HEIGHT} L${line.replaceAll(' ', ' L')} L${x(points.length - 1)},${TOP + PLOT_HEIGHT} Z`;
  const ariaLabel = `${title}. ${points
    .map((point) => `${point.label} ${formatValue(point.value)}`)
    .join(', ')}. ${reference.label}.`;

  return (
    <section className="metric-chart" aria-label={title}>
      <div className="metric-chart-head">
        <h3>{title}</h3>
        <span className="metric-ref">
          <i />
          {reference.label}
        </span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#635B85" stopOpacity=".18" />
            <stop offset="100%" stopColor="#635B85" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((index) => (
          <g key={index}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(index * step)}
              y2={y(index * step)}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <text x={LEFT - 10} y={y(index * step) + 4} textAnchor="end">
              {formatValue(index * step)}
            </text>
          </g>
        ))}
        <line
          x1={LEFT}
          x2={WIDTH - RIGHT}
          y1={y(reference.value)}
          y2={y(reference.value)}
          stroke="#F2BB69"
          strokeWidth="2"
          strokeDasharray="5 5"
        >
          <title>{reference.label}</title>
        </line>
        <path d={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => {
          const isLast = index === points.length - 1;
          const aboveReference = point.value > reference.value;
          return (
            <g key={point.label}>
              <circle
                cx={x(index)}
                cy={y(point.value)}
                r={isLast ? 5 : 4}
                fill={aboveReference ? '#F2BB69' : isLast ? '#61E2A6' : 'var(--primary)'}
                stroke="var(--surface)"
                strokeWidth="2"
              >
                <title>
                  {point.label} · {seriesLabel} {formatValue(point.value)}
                </title>
              </circle>
              <text x={x(index)} y={HEIGHT - 10} textAnchor="middle">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

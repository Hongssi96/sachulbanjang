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
  if (!points.length) return <p className="metric-empty">표시할 기록이 없어요.</p>;

  const step = niceStep(Math.max(reference.value, ...points.map((point) => point.value)) / 4);
  const max = step * 4;
  const x = (index: number) =>
    points.length === 1 ? LEFT + PLOT_WIDTH / 2 : LEFT + (index * PLOT_WIDTH) / (points.length - 1);
  const y = (value: number) => TOP + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT;
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
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
        {[0, 1, 2, 3, 4].map((index) => (
          <line
            key={index}
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={y(index * step)}
            y2={y(index * step)}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
        ))}
        {[0, 1, 2, 3, 4].map((index) => (
          <text key={index} x={LEFT - 10} y={y(index * step) + 4} textAnchor="end">
            {formatValue(index * step)}
          </text>
        ))}
        <line
          className="metric-ref-line"
          x1={LEFT}
          x2={WIDTH - RIGHT}
          y1={y(reference.value)}
          y2={y(reference.value)}
          stroke="var(--metric-reference)"
          strokeWidth="1"
          strokeDasharray="4 4"
        >
          <title>{reference.label}</title>
        </line>
        <polyline
          className="metric-line"
          points={line}
          pathLength={1}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <circle
            className="metric-dot"
            key={point.label}
            cx={x(index)}
            cy={y(point.value)}
            r={index === points.length - 1 ? 4.5 : 3}
            fill={index === points.length - 1 ? '#61E2A6' : 'var(--primary)'}
            stroke="var(--surface)"
            strokeWidth="2"
          >
            <title>
              {point.label} · {seriesLabel} {formatValue(point.value)}
            </title>
          </circle>
        ))}
        {points.map((point, index) => (
          <text key={point.label} x={x(index)} y={HEIGHT - 10} textAnchor="middle">
            {point.label}
          </text>
        ))}
      </svg>
    </section>
  );
}

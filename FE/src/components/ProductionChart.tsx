import { formatNumber } from '../utils/numberFormat';
interface ProductionChartProps {
  period: 'today' | 'week';
}
export default function ProductionChart({ period }: ProductionChartProps) {
  const values =
    period === 'today'
      ? [360, 470, 420, 620, 580, 790, 650, 720, 622]
      : [4100, 4380, 4500, 4700, 4800, 4900, 5100, 5098, 5232];
  const points = values
    .map((value, i) => `${62 + i * 76},${232 - value * (period === 'today' ? 0.25 : 0.025)}`)
    .join(' ');
  const labels =
    period === 'today'
      ? ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']
      : ['11.09', '11.10', '11.11', '11.12', '11.13', '11.14', '11.15', '11.16', '11.17'];
  return (
    <div className="chart-wrap">
      <svg
        viewBox="0 0 730 272"
        role="img"
        aria-label={
          period === 'today'
            ? '시간별 생산량: 총 5,232개, 오전 8시 360개에서 오후 4시 622개까지'
            : '일별 생산량 추이'
        }
      >
        {(period === 'today' ? [0, 200, 400, 600, 800] : [0, 2000, 4000, 6000, 8000]).map(
          (value) => (
            <g key={value.toLocaleString()}>
              <line
                x1="62"
                y1={232 - value * (period === 'today' ? 0.25 : 0.025)}
                x2="695"
                y2={232 - value * (period === 'today' ? 0.25 : 0.025)}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
              <text
                x="44"
                y={236 - value * (period === 'today' ? 0.25 : 0.025)}
                textAnchor="end"
                className="chart-axis"
              >
                {formatNumber(value)}
              </text>
            </g>
          ),
        )}
        <line x1="62" y1="107" x2="695" y2="107" stroke="#A9AAB5" strokeDasharray="5 5" />
        <polyline
          points={points}
          fill="none"
          stroke="#635B85"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((value, i) => (
          <circle
            key={i}
            cx={62 + i * 76}
            cy={232 - value * (period === 'today' ? 0.25 : 0.025)}
            r={i === 5 ? 5 : 3}
            fill={i === 5 ? '#61E2A6' : '#635B85'}
            stroke="var(--surface)"
            strokeWidth="2"
          >
            <title>
              {labels[i]} · {formatNumber(value)}개
            </title>
          </circle>
        ))}
        {labels.map((label, i) => (
          <text key={label} x={62 + i * 76} y="260" textAnchor="middle" className="chart-axis">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

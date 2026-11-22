import { useId, useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
const series = {
  today: { labels: ['08시', '10시', '12시', '14시', '16시'], values: [3.2, 2.6, 2.9, 2.1, 2.4] },
  week: {
    labels: ['11.11', '11.12', '11.13', '11.14', '11.15', '11.16', '11.17'],
    values: [3.2, 2.9, 3.5, 2.7, 2.1, 2.8, 2.4],
  },
};
export default function TabletQualityCard() {
  const [period, setPeriod] = useState<'today' | 'week'>('week');
  const id = useId();
  const data = series[period];
  const points = data.values.map((value, index) => ({
    x: 12 + (index * 276) / (data.values.length - 1),
    y: 120 - value * 24,
  }));
  const curve = points
    .map((point, index) => {
      if (!index) return `M${point.x},${point.y}`;
      const previous = points[index - 1];
      const middle = (point.x + previous.x) / 2;
      return `C${middle},${previous.y} ${middle},${point.y} ${point.x},${point.y}`;
    })
    .join(' ');
  return (
    <section className="card th-quality-card">
      <div className="th-section-heading">
        <div>
          <span className="th-card-kicker">QUALITY BRIEF</span>
          <h2>품질 추이</h2>
        </div>
        <span className="th-quality-symbol">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="th-quality-value">
        <strong>
          2.4<span>%</span>
        </strong>
        <span>
          <ArrowDownRight size={14} />
          이전 구간 대비 0.8%p
        </span>
      </div>
      <div className="th-raised-tabs" role="group" aria-label="품질 추이 조회 기간">
        <button aria-pressed={period === 'today'} onClick={() => setPeriod('today')}>
          오늘
        </button>
        <button aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>
          최근 7일
        </button>
      </div>
      <svg
        viewBox="0 0 300 150"
        className="th-quality-graph"
        role="img"
        aria-label={`${period === 'week' ? '최근 7일' : '오늘 시간대별'} 검사 불량률: ${data.values.map((value, index) => `${data.labels[index]} ${value}%`).join(', ')}`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#635B85" stopOpacity=".17" />
            <stop offset="1" stopColor="#635B85" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[24, 72, 120].map((y) => (
          <line key={y} x1="12" y1={y} x2="288" y2={y} stroke="#e9e5ef" strokeDasharray="3 4" />
        ))}
        <path d={`${curve} L288,128 L12,128 Z`} fill={`url(#${id})`} />
        <path d={curve} stroke="#635B85" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle
          cx="288"
          cy={points[points.length - 1].y}
          r="5"
          fill="#61E2A6"
          stroke="#fff"
          strokeWidth="3"
        />
        {data.labels.map((label, index) => (
          <text
            key={label}
            x={points[index].x}
            y="146"
            textAnchor={index === 0 ? 'start' : index === data.labels.length - 1 ? 'end' : 'middle'}
            fontSize="9"
            fill="#85818f"
          >
            {label}
          </text>
        ))}
      </svg>
      <p className="th-quality-note">검사 기록 기준</p>
    </section>
  );
}

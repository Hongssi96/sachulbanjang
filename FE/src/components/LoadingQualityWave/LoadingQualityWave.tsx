import { useId } from 'react';
import './LoadingQualityWave.css';

const signals = [
  {
    name: '온도',
    color: '#9479B4',
    baseline: 48,
    path: 'M76 53C88 53 92 44 104 48S124 61 137 51S155 38 169 46S189 55 203 44S223 38 237 45S256 53 271 42S292 32 307 39S325 46 336 38',
  },
  {
    name: '압력',
    color: '#57BCA0',
    baseline: 96,
    path: 'M76 103H88C97 103 96 81 108 81H120C132 81 129 104 143 104H157C169 104 168 85 180 85H194C206 85 203 103 216 103H229C242 103 239 79 252 79H267C280 79 277 101 290 101H304C317 101 315 87 328 87H336',
  },
  {
    name: '사이클',
    color: '#A89BC3',
    baseline: 144,
    path: 'M76 148C88 148 92 135 104 135S122 151 137 151S154 137 169 137S187 150 202 150S221 133 236 133S254 148 270 148S289 136 304 136S323 147 336 143',
  },
];

export default function LoadingQualityWave() {
  const id = useId();
  return (
    <div className="loading-quality-wave" aria-hidden="true">
      <svg viewBox="0 0 360 184" fill="none" focusable="false">
        <defs>
          <clipPath id={`${id}-reveal`}>
            <rect className="quality-wave-reveal" x="72" y="20" width="272" height="144" />
          </clipPath>
          <clipPath id={`${id}-plot`}>
            <rect x="72" y="20" width="272" height="144" />
          </clipPath>
          <linearGradient id={`${id}-scan`}>
            <stop stopColor="#A68CC3" stopOpacity="0" />
            <stop offset="1" stopColor="#A68CC3" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <g className="quality-wave-grid" stroke="#D9D2E4" strokeOpacity="0.45" strokeWidth="0.8">
          {[72, 140, 208, 276, 344].map((x) => (
            <path d={`M${x} 20V164`} key={x} />
          ))}
          {signals.map((signal) => (
            <path d={`M72 ${signal.baseline}H344`} strokeDasharray="2 5" key={signal.name} />
          ))}
        </g>
        {signals.map((signal) => (
          <g key={signal.name}>
            <circle cx="17" cy={signal.baseline} r="2.5" fill={signal.color} />
            <text className="quality-wave-channel" x="26" y={signal.baseline + 4} fill="#8C819B">
              {signal.name}
            </text>
            <path
              d={signal.path}
              stroke={signal.color}
              strokeOpacity="0.13"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        ))}
        <g clipPath={`url(#${id}-plot)`}>
          <g className="quality-wave-scan">
            <rect x="54" y="20" width="18" height="144" fill={`url(#${id}-scan)`} />
            <path d="M72 20V164" stroke="#AB90C6" strokeOpacity="0.35" />
          </g>
        </g>
        <g className="quality-wave-traces" clipPath={`url(#${id}-reveal)`}>
          {signals.map((signal) => (
            <path
              d={signal.path}
              stroke={signal.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              key={signal.name}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

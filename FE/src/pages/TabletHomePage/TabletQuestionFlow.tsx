import type { QuestionSelection } from './questionModel';
import { emptyQuestionSelection } from './questionModel';
import { useState } from 'react';
import {
  ChartNoAxesCombined,
  Check,
  Clock3,
  Factory,
  Package,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

const groups = [
  { key: 'product', name: '제품', icon: Package, options: ['CN7', 'RG3', 'JX1', 'SP2'] },
  {
    key: 'line',
    name: '라인',
    icon: Factory,
    options: ['사출 1라인', '사출 2라인', '검사 라인', '포장 라인'],
  },
  {
    key: 'topic',
    name: '확인 내용',
    icon: ShieldCheck,
    options: ['작업 규칙', '생산량', '불량률', '온도', '압력'],
  },
  { key: 'view', name: '보기 방식', icon: ChartNoAxesCombined, options: ['요약', '그래프', '표'] },
  { key: 'period', name: '기간', icon: Clock3, options: ['현재', '최근 1시간', '오늘', '기타'] },
] as const;
export default function TabletQuestionFlow({
  selection,
  onChange,
}: {
  selection: QuestionSelection;
  onChange: (selection: QuestionSelection) => void;
}) {
  const [active, setActive] = useState(0);
  const group = groups[active];
  const selectedCount = Object.values(selection).filter(Boolean).length;
  return (
    <div className="th-flow">
      <div className="th-flow-toolbar">
        <span>
          <i />
          질문 워크스페이스
        </span>
        <button
          onClick={() => {
            onChange(emptyQuestionSelection);
            setActive(0);
          }}
        >
          <RotateCcw size={14} />
          초기화
        </button>
      </div>
      <div className="th-flow-canvas" aria-label="질문 조합 단계">
        <svg
          className="th-flow-connectors"
          viewBox="0 0 600 238"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M100 55 H500 Q570 55 570 112 V178 H100" />
          <path d="M100 178 H500" />
        </svg>
        <div className="th-flow-nodes">
          {groups.map(({ key, name, icon: Icon }, index) => (
            <button
              className={`th-flow-node node-${key} ${active === index ? 'is-active' : ''} ${selection[key] ? 'is-complete' : ''}`}
              key={key}
              onClick={() => setActive(index)}
              aria-pressed={active === index}
              aria-label={`${name} 선택: ${selection[key] || '선택 전'}`}
            >
              <span className="th-node-step">0{index + 1}</span>
              <span className="th-node-icon">
                <Icon size={23} />
              </span>
              <strong>{selection[key] || name}</strong>
              <small>
                {selection[key] ? name : key === 'period' ? '선택 사항' : '선택해 주세요'}
              </small>
              {selection[key] && <Check className="th-node-check" size={14} />}
            </button>
          ))}
          <div className="th-flow-end">
            <span>
              {selectedCount}
              <small>/ 5</small>
            </span>
            <small>질문 조합</small>
          </div>
        </div>
      </div>
      <div className="th-flow-inspector">
        <div>
          <span>0{active + 1}</span>
          <strong>{group.name} 선택</strong>
          <small>{group.key === 'period' ? '선택 사항' : '필수 항목'}</small>
        </div>
        <div className="th-flow-options" role="group" aria-label={group.name}>
          {group.options.map((option) => (
            <button
              key={option}
              aria-pressed={selection[group.key] === option}
              onClick={() => {
                onChange({ ...selection, [group.key]: option });
                if (active < groups.length - 1) setActive(active + 1);
              }}
            >
              {option}
              {selection[group.key] === option && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

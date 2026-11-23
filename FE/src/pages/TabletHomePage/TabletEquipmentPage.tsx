import { useState } from 'react';
import { Link } from 'react-router';
import { Factory, Thermometer, Gauge, ArrowRight } from 'lucide-react';
import Modal from '../../components/Modal';
import { tabletEquipment } from './tabletData';
export default function TabletEquipmentPage() {
  const [filter, setFilter] = useState('전체');
  const [selected, setSelected] = useState<string | null>(null);
  const item = tabletEquipment.find((row) => row.id === selected);
  return (
    <div className="tp-page">
      <div className="tp-title">
        <div>
          <h1 className="sr-only">설비 현황</h1>
        </div>
        <span className="tp-date">시연 데이터 · 실시간 아님</span>
      </div>
      <div className="tp-stats">
        {['정상', '주의', '미가동'].map((state) => (
          <div key={state}>
            <small>{state}</small>
            <strong>
              {tabletEquipment.filter((row) => row.state === state).length}
              <span>대</span>
            </strong>
          </div>
        ))}
      </div>
      <div className="tp-tabs" role="group" aria-label="설비 상태 필터">
        {['전체', '정상', '주의', '미가동'].map((value) => (
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value}
          </button>
        ))}
      </div>
      <section className="tp-equipment-grid" aria-label="담당 설비 목록">
        {tabletEquipment
          .filter((row) => filter === '전체' || row.state === filter)
          .map((row) => (
            <button
              className="card tp-equipment"
              data-state={row.state}
              key={row.id}
              onClick={() => setSelected(row.id)}
            >
              <div className="tp-machine-top">
                <span>
                  <Factory size={23} />
                  <strong>{row.id}</strong>
                </span>
                <span
                  className={`tp-badge ${row.state === '정상' ? 'normal' : row.state === '주의' ? 'warning' : 'idle'}`}
                >
                  {row.state}
                </span>
              </div>
              <h2>{row.product}</h2>
              <div className="tp-readings">
                <span>
                  <Thermometer size={18} />
                  온도{' '}
                  <strong>
                    {row.temperature}
                    <small>℃</small>
                  </strong>
                </span>
                <span>
                  <Gauge size={18} />
                  압력{' '}
                  <strong>
                    {row.pressure}
                    <small>bar</small>
                  </strong>
                </span>
              </div>
              <div className="tp-output">
                <span>생산량</span>
                <strong>
                  {row.output} / {row.target}
                  <small>개</small>
                </strong>
              </div>
              <div className="tp-progress">
                <span style={{ width: `${Math.round((row.output / row.target) * 100)}%` }} />
              </div>
              <p>{row.note}</p>
              <span className="tp-open">
                설비 상세 확인 <ArrowRight size={17} />
              </span>
            </button>
          ))}
      </section>
      <p className="th-demo">
        수치는 태블릿 시연을 위한 예시이며 실제 설비 가동 상태를 나타내지 않습니다.
      </p>
      {item && (
        <Modal title={`${item.id} 설비 상세`} onClose={() => setSelected(null)}>
          <div className="th-form">
            <p>
              <strong>
                {item.product} · {item.state}
              </strong>
            </p>
            <p>{item.note}</p>
            <dl className="tp-detail">
              <div>
                <dt>온도</dt>
                <dd>{item.temperature} ℃</dd>
              </div>
              <div>
                <dt>압력</dt>
                <dd>{item.pressure} bar</dd>
              </div>
              <div>
                <dt>생산량 / 목표</dt>
                <dd>
                  {item.output} / {item.target}개
                </dd>
              </div>
            </dl>
            <p>시연 데이터입니다. 이상 여부는 현장 계기와 승인된 관리 기준으로 확인해 주세요.</p>
            <Link className="button button-primary" to={`/reports?equipment=${item.id}`}>
              이 설비 이상 보고 <ArrowRight size={17} />
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}

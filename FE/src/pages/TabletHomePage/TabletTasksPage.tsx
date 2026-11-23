import { useState } from 'react';
import { ArrowRight, Check, ClipboardCheck, Clock3 } from 'lucide-react';
import Modal from '../../components/Modal';
const initial = [
  {
    id: 'TW-01',
    time: '09:20',
    title: 'CN7 초도 제품 검사',
    equipment: 'S01 · CN7 LH',
    note: '외관·치수 검사 결과를 확인하고 검사표를 작성하세요.',
    status: '완료',
  },
  {
    id: 'TW-02',
    time: '11:00',
    title: 'RG3 생산 조건 확인',
    equipment: 'S14 · RG3 RH',
    note: '압력 변동과 금형 상태를 확인하고 외관 검사를 진행하세요.',
    status: '진행 중',
  },
  {
    id: 'TW-03',
    time: '14:00',
    title: '금형 교체 작업 지원',
    equipment: 'S08 · SP2 RH',
    note: '현장 승인된 안전 절차를 확인한 후 담당자와 함께 진행하세요.',
    status: '대기',
  },
  {
    id: 'TW-04',
    time: '16:30',
    title: '교대 전 점검 및 인수인계',
    equipment: '담당 설비 전체',
    note: '미해결 문제와 조치 내용을 다음 근무자에게 전달하세요.',
    status: '대기',
  },
];
export default function TabletTasksPage() {
  const [tasks, setTasks] = useState(initial);
  const [filter, setFilter] = useState('전체');
  const [selected, setSelected] = useState<string | null>(null);
  const [checks, setChecks] = useState<string[]>([]);
  const task = tasks.find((item) => item.id === selected);
  const rows = tasks.filter((item) => filter === '전체' || item.status === filter);
  const steps = [
    '작업 지시 및 대상 설비 확인',
    '안전 절차에 따라 현장 확인 완료',
    '검사 결과 또는 조치 내용 기록',
  ];
  return (
    <div className="tp-page">
      <div className="tp-title">
        <div>
          <span>FIELD WORK</span>
          <h1 className="sr-only">작업 지시</h1>
        </div>
        <span className="tp-date">2026.11.17 · 주간조</span>
      </div>
      <div className="tp-stats">
        <div>
          <small>오늘 작업</small>
          <strong>
            {tasks.length}
            <span>건</span>
          </strong>
        </div>
        <div>
          <small>진행 중</small>
          <strong>
            {tasks.filter((item) => item.status === '진행 중').length}
            <span>건</span>
          </strong>
        </div>
        <div>
          <small>완료</small>
          <strong className="th-green">
            {tasks.filter((item) => item.status === '완료').length}
            <span>건</span>
          </strong>
        </div>
      </div>
      <div className="tp-tabs" role="group" aria-label="작업 상태 필터">
        {['전체', '대기', '진행 중', '완료'].map((value) => (
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value}
          </button>
        ))}
      </div>
      <section className="tp-task-list" aria-label="작업 지시 목록">
        {rows.length ? (
          rows.map((item) => (
            <button
              key={item.id}
              className="card tp-task"
              onClick={() => {
                setSelected(item.id);
                setChecks([]);
              }}
            >
              <span className="tp-task-time">
                <Clock3 size={17} />
                {item.time}
              </span>
              <span className="tp-task-copy">
                <strong>{item.title}</strong>
                <small>{item.equipment}</small>
                <p>{item.note}</p>
              </span>
              <span
                className={`tp-badge ${item.status === '완료' ? 'normal' : item.status === '진행 중' ? 'active' : 'idle'}`}
              >
                {item.status}
              </span>
              <ArrowRight size={19} />
            </button>
          ))
        ) : (
          <div className="card tp-empty">해당 상태의 작업이 없습니다.</div>
        )}
      </section>
      <p className="th-demo">태블릿 전용 작업입니다.</p>
      {task && (
        <Modal title={task.title} onClose={() => setSelected(null)}>
          <div className="th-form">
            <p>
              <strong>{task.equipment}</strong> · {task.time}
            </p>
            <p>{task.note}</p>
            {task.status === '완료' ? (
              <p className="tp-success">
                <Check size={18} /> 완료된 작업입니다.
              </p>
            ) : (
              <>
                {steps.map((step) => (
                  <label className="th-check" key={step}>
                    <input
                      type="checkbox"
                      checked={checks.includes(step)}
                      onChange={(event) =>
                        setChecks(
                          event.target.checked
                            ? [...checks, step]
                            : checks.filter((value) => value !== step),
                        )
                      }
                    />
                    {step}
                  </label>
                ))}
                {task.status === '대기' && (
                  <button
                    className="button button-white"
                    onClick={() =>
                      setTasks(
                        tasks.map((item) =>
                          item.id === task.id ? { ...item, status: '진행 중' } : item,
                        ),
                      )
                    }
                  >
                    작업 시작
                  </button>
                )}
                <button
                  className="button button-primary"
                  disabled={checks.length !== steps.length}
                  onClick={() => {
                    setTasks(
                      tasks.map((item) =>
                        item.id === task.id ? { ...item, status: '완료' } : item,
                      ),
                    );
                    setSelected(null);
                  }}
                >
                  <ClipboardCheck size={18} /> 작업 완료
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

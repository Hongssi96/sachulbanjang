import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import Modal from '../../components/Modal';
import { tabletEquipment } from './tabletData';
import type { TabletReport } from './tabletData';
export default function TabletReportsPage({
  reports,
  onReport,
}: {
  reports: TabletReport[];
  onReport: (report: TabletReport) => void;
}) {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(Boolean(params.get('equipment')));
  const [equipment, setEquipment] = useState(
    tabletEquipment.find((row) => row.id === params.get('equipment'))?.id ?? 'S14',
  );
  const [type, setType] = useState('압력 이상');
  const [description, setDescription] = useState('');
  const [filter, setFilter] = useState('전체');
  const [selected, setSelected] = useState<TabletReport | null>(null);
  const [feedback, setFeedback] = useState('');
  return (
    <div className="tp-page">
      <div className="tp-title">
        <div>
          <h1 className="sr-only">이상 보고</h1>
        </div>
        <button className="button button-primary" onClick={() => setOpen(true)}>
          <Plus size={19} /> 이상 보고 작성
        </button>
      </div>
      {feedback && (
        <div className="th-feedback" role="status">
          <Check size={18} />
          {feedback}
          <button onClick={() => setFeedback('')}>닫기</button>
        </div>
      )}
      <div className="tp-stats">
        <div>
          <small>전체 보고</small>
          <strong>
            {reports.length}
            <span>건</span>
          </strong>
        </div>
        <div>
          <small>미완료</small>
          <strong>
            {reports.filter((row) => row.status !== '처리 완료').length}
            <span>건</span>
          </strong>
        </div>
        <div>
          <small>처리 완료</small>
          <strong>
            {reports.filter((row) => row.status === '처리 완료').length}
            <span>건</span>
          </strong>
        </div>
      </div>
      <div className="tp-tabs" role="group" aria-label="보고 상태 필터">
        {['전체', '접수 대기', '확인 중', '처리 완료'].map((value) => (
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value}
          </button>
        ))}
      </div>
      <section className="tp-report-list" aria-label="이상 보고 목록">
        {reports.filter((row) => filter === '전체' || row.status === filter).length ? (
          reports
            .filter((row) => filter === '전체' || row.status === filter)
            .map((row) => (
              <button className="card tp-report" key={row.id} onClick={() => setSelected(row)}>
                <span className="tp-report-icon">
                  <TriangleAlert size={22} />
                </span>
                <span className="tp-task-copy">
                  <strong>
                    {row.equipment} · {row.type}
                  </strong>
                  <p>{row.description}</p>
                  <small>
                    {row.id} · 박민규 · {row.time}
                  </small>
                </span>
                <span className={`tp-badge ${row.status === '처리 완료' ? 'normal' : 'warning'}`}>
                  {row.status}
                </span>
              </button>
            ))
        ) : (
          <div className="card tp-empty">해당 상태의 보고가 없습니다.</div>
        )}
      </section>
      <p className="th-demo">
        작성 내용은 현재 태블릿 화면에서만 유지됩니다. 실제 관리자·기존 사이트에 전송되지 않습니다.
      </p>
      {open && (
        <Modal title="이상 보고 작성" onClose={() => setOpen(false)}>
          <form
            className="th-form"
            onSubmit={(event) => {
              event.preventDefault();
              onReport({
                id: `TR-${Date.now()}`,
                equipment,
                type,
                description: description.trim(),
                status: '접수 대기',
                time: new Intl.DateTimeFormat('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                  timeZone: 'Asia/Seoul',
                }).format(new Date()),
              });
              setOpen(false);
              setDescription('');
              setFilter('전체');
              setFeedback('태블릿에 예시 보고를 기록했어요. 실제 전송은 하지 않습니다.');
            }}
          >
            <fieldset className="tp-choices">
              <legend>대상 설비</legend>
              {tabletEquipment.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  aria-pressed={equipment === row.id}
                  onClick={() => setEquipment(row.id)}
                >
                  {row.id}
                </button>
              ))}
            </fieldset>
            <fieldset className="tp-choices">
              <legend>이상 유형</legend>
              {['압력 이상', '온도 이상', '제품 불량', '설비 정지', '점검 요청'].map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {value}
                </button>
              ))}
            </fieldset>
            <label>
              이상 내용
              <textarea
                required
                maxLength={1000}
                placeholder="발생 위치와 확인한 내용을 남겨 주세요."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <small>독립 태블릿 시연용 보고입니다.</small>
            <button className="button button-primary" disabled={!description.trim()}>
              예시 보고 기록
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal title={`${selected.equipment} · ${selected.type}`} onClose={() => setSelected(null)}>
          <div className="th-form">
            <p>
              <strong>{selected.status}</strong> · {selected.time}
            </p>
            <p className="tp-report-body">{selected.description}</p>
            <small>관리자 처리 상태는 시연용이며 서버와 연결되지 않습니다.</small>
          </div>
        </Modal>
      )}
    </div>
  );
}

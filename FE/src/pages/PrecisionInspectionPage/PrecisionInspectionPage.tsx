import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Check, ClipboardCheck, Cpu, Download, TriangleAlert } from 'lucide-react';
import { formatRecordTimestamp, productionInspectionRecords } from '../../services/inspectionData';
import '../RecordsPage/RecordsPage.css';
import './PrecisionInspectionPage.css';
const measurements = [
  { name: '금형 평행도', point: '형판 A–B 기준면', value: 0.03, min: 0, max: 0.05, unit: 'mm' },
  {
    name: '금형 정렬 편차',
    point: '고정측 / 이동측 중심',
    value: 0.04,
    min: 0,
    max: 0.05,
    unit: 'mm',
  },
  {
    name: '스크루 위치 반복 편차',
    point: '사출 종료 위치',
    value: 0.12,
    min: 0,
    max: 0.1,
    unit: 'mm',
  },
  { name: '형체력 측정값', point: '형체부', value: 1780, min: 1710, max: 1890, unit: 'kN' },
  { name: '사출 압력 측정값', point: '사출부', value: 118, min: 110, max: 125, unit: 'MPa' },
  { name: '히터 온도 측정값', point: '배럴 3구간', value: 225, min: 220, max: 230, unit: '℃' },
];
const isPass = (item: (typeof measurements)[number]) =>
  item.value >= item.min && item.value <= item.max;
export default function PrecisionInspectionPage() {
  const { recordId } = useParams();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'measurements' | 'checklist'>('measurements');
  const record = productionInspectionRecords.find((row) => row.id === recordId);
  const query = params.size ? `?${params}` : '';
  const back = `/records${query}`;
  if (!record)
    return (
      <section className="records-page">
        <Link className="rd-button" to={back}>
          <ArrowLeft size={16} /> 이력 목록으로
        </Link>
        <div className="rd-panel rd-empty">
          <h1>검사 대상 이력을 찾을 수 없어요</h1>
          <p>생산·검사 이력에서 대상 배치를 다시 선택해 주세요.</p>
        </div>
      </section>
    );
  const passed = measurements.filter(isPass).length;
  function exportInspection() {
    const content =
      '\uFEFF' +
      [
        ['시연용 정밀기계검사 · 실제 검사 결과 아님'],
        ['검사 대상', record!.equipment, record!.id],
        ['측정 항목', '측정 위치', '측정값', '하한', '상한', '단위', '예시 판정'],
        ...measurements.map((item) => [
          item.name,
          item.point,
          item.value,
          item.min,
          item.max,
          item.unit,
          isPass(item) ? '적합' : '재확인',
        ]),
      ]
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `정밀기계검사_${record!.equipment}_예시.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="records-page precision-page">
      <div className="rd-heading">
        <div>
          <h1>정밀기계검사</h1>
          <p>
            {record.equipment} · {record.product} · {record.lotId}
          </p>
        </div>
        <div className="rd-heading-actions">
          <button className="rd-button" onClick={exportInspection}>
            <Download size={16} /> 검사표 다운로드
          </button>
          <Link className="rd-button rd-primary" to={back}>
            <ArrowLeft size={16} /> 목록으로 돌아가기
          </Link>
        </div>
      </div>
      <div className="pi-overview rd-panel">
        <div className="pi-machine">
          <span className="pi-machine-icon">
            <Cpu size={30} />
          </span>
          <div>
            <span className="rd-eyebrow">INSPECTION TARGET</span>
            <h2>{record.equipment} 사출 설비</h2>
            <p>연결 검사 번호 {record.id}</p>
          </div>
        </div>
        <div className="pi-overview-status">
          <span className="rd-pill warn">
            <TriangleAlert size={12} /> 재확인 필요 · 예시
          </span>
          <p>스크루 위치 반복 편차가 예시 범위를 벗어났어요.</p>
        </div>
      </div>
      <div className="rd-summary">
        {[
          ['검사 항목', String(measurements.length), '개 항목'],
          ['범위 내 항목', String(passed), '개 항목'],
          ['재확인 항목', String(measurements.length - passed), '개 항목'],
          ['연결 검사 담당', record.inspector, '생산·검사 이력 기준'],
        ].map(([label, value, note]) => (
          <div className="rd-panel" key={label}>
            <span className="rd-stat-label">{label}</span>
            <strong>{value}</strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <div className="pi-content">
        <article className="rd-panel rd-list">
          <div className="rd-list-heading">
            <div>
              <h2>정밀 검사 결과</h2>
            </div>
            <ClipboardCheck size={22} />
          </div>
          <div className="rd-tabs" aria-label="정밀 검사 내용">
            <button
              className={tab === 'measurements' ? 'active' : ''}
              aria-pressed={tab === 'measurements'}
              onClick={() => setTab('measurements')}
            >
              측정 결과
            </button>
            <button
              className={tab === 'checklist' ? 'active' : ''}
              aria-pressed={tab === 'checklist'}
              onClick={() => setTab('checklist')}
            >
              점검 체크리스트
            </button>
          </div>
          {tab === 'measurements' ? (
            <div className="rd-table-wrap">
              <table>
                <caption className="sr-only">시연용 정밀기계검사 측정 결과</caption>
                <thead>
                  <tr>
                    <th>검사 항목 / 측정 위치</th>
                    <th>허용 범위 · 예시</th>
                    <th>측정값 · 예시</th>
                    <th>판정</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((item) => (
                    <tr key={item.name}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>{item.point}</small>
                      </td>
                      <td>
                        {item.min}–{item.max} {item.unit}
                      </td>
                      <td className={isPass(item) ? '' : 'rd-defective'}>
                        <strong>{item.value}</strong> {item.unit}
                      </td>
                      <td>
                        <span className={`rd-pill ${isPass(item) ? 'good' : 'warn'}`}>
                          {isPass(item) ? '적합' : '재확인'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="pi-checklist">
              {[
                ['검사 대상 및 배치 식별', '설비 번호와 연결된 생산 배치를 확인했습니다.'],
                ['측정 위치 구분', '금형·사출부·형체부의 측정 위치를 구분했습니다.'],
                ['측정 결과 확인', '6개 측정 항목의 예시 결과를 확인했습니다.'],
                ['이상 항목 재확인', '스크루 위치 반복 편차를 재확인할 항목으로 남겼습니다.'],
              ].map(([label, detail], index) => (
                <li key={label}>
                  <span className={index === 3 ? 'pi-check-warn' : 'pi-check-good'}>
                    {index === 3 ? <TriangleAlert size={17} /> : <Check size={17} />}
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <p>{detail}</p>
                  </div>
                  <span className={`rd-pill ${index === 3 ? 'warn' : 'good'}`}>
                    {index === 3 ? '확인 필요' : '예시 완료'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="pi-table-note">
            예시 판정: 측정값이 하한 이상·상한 이하면 적합으로 표시합니다. 실제 설비 운전·정비
            판단에 사용하지 마세요.
          </p>
        </article>
        <aside>
          <article className="rd-panel rd-detail-card">
            <h2>검사 기본 정보</h2>
            <dl className="pi-info">
              {[
                ['검사 유형', '정밀기계검사'],
                ['설비 번호', record.equipment],
                ['연결 제품', record.product],
                ['연결 검사일시', formatRecordTimestamp(record.inspectedAt)],
                ['검사표 상태', '시연용 · 미승인'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article className="rd-panel rd-detail-card pi-followup">
            <TriangleAlert size={23} />
            <h2>재확인 항목</h2>
            <strong>스크루 위치 반복 편차</strong>
            <p>예시 측정값 0.12 mm / 예시 상한 0.10 mm</p>
            <p>실제 적용 시 설비별 승인된 검사 기준과 측정 기록을 연결해 확인해야 합니다.</p>
          </article>
          <Link className="rd-button pi-related" to={`/records/${record.id}${query}`}>
            연결된 생산·검사 상세 보기 <ClipboardCheck size={16} />
          </Link>
        </aside>
      </div>
    </section>
  );
}

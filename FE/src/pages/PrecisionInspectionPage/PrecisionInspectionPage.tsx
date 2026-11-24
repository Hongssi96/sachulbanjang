import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CircleHelp, ClipboardCheck, Cpu, Download, TriangleAlert } from 'lucide-react';
import ApiErrorState from '../../components/ApiErrorState';
import LoadingState from '../../components/LoadingState';
import { ApiError } from '../../api/client';
import { fetchInspectionRecord, fetchProcessRecord } from '../../api/records';
import type { InspectionRecord, ProcessRecord } from '../../api/records';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatDateTime } from '../../utils/dateFormat';
import '../RecordsPage/RecordsPage.css';
import './PrecisionInspectionPage.css';

const NA = '—';
const measurements = [
  { name: '금형 평행도', point: '형판 A–B 기준면', min: 0, max: 0.05, unit: 'mm' },
  { name: '금형 정렬 편차', point: '고정측 / 이동측 중심', min: 0, max: 0.05, unit: 'mm' },
  { name: '스크루 위치 반복 편차', point: '사출 종료 위치', min: 0, max: 0.1, unit: 'mm' },
  { name: '형체력 측정값', point: '형체부', min: 1710, max: 1890, unit: 'kN' },
  { name: '사출 압력 측정값', point: '사출부', min: 110, max: 125, unit: 'MPa' },
  { name: '히터 온도 측정값', point: '배럴 3구간', min: 220, max: 230, unit: '℃' },
];
const checklist = [
  { label: '검사 대상 및 배치 식별', detail: '설비 번호와 연결된 생산 배치를 확인합니다.' },
  { label: '측정 위치 구분', detail: '금형·사출부·형체부의 측정 위치를 구분합니다.' },
  { label: '측정 결과 확인', detail: '측정값이 제공되면 항목별 결과를 확인합니다.' },
  { label: '이상 항목 재확인', detail: '허용 범위를 벗어난 항목을 재확인합니다.' },
];
type RecordView = 'inspection' | 'production';

const readView = (value: string | null): RecordView =>
  value === 'production' ? 'production' : 'inspection';

export default function PrecisionInspectionPage() {
  const { recordId } = useParams();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'measurements' | 'checklist'>('measurements');
  const view = readView(params.get('view'));
  const recordIdNumber = Number(recordId);
  const validId = Number.isInteger(recordIdNumber) && recordIdNumber > 0;
  const inspectionDetail = useApiQuery(
    `precision:inspection:${recordId}`,
    () => fetchInspectionRecord(recordIdNumber),
    { enabled: validId && view === 'inspection' },
  );
  const processDetail = useApiQuery(
    `precision:process:${recordId}`,
    () => fetchProcessRecord(recordIdNumber),
    { enabled: validId && view === 'production' },
  );
  const active = view === 'inspection' ? inspectionDetail : processDetail;
  const inspectionRecord: InspectionRecord | null =
    view === 'inspection' ? inspectionDetail.data : null;
  const processRecord: ProcessRecord | null = view === 'production' ? processDetail.data : null;
  const record = inspectionRecord ?? processRecord;
  const query = params.size ? `?${params}` : '';
  const back = `/records${query}`;
  const notFound = (
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

  if (!validId) return notFound;
  if (active.loading && !record) {
    return (
      <section className="records-page">
        <Link className="rd-button" to={back}>
          <ArrowLeft size={16} /> 이력 목록으로
        </Link>
        <LoadingState label="검사 기록을 불러오는 중이에요" />
      </section>
    );
  }
  if (active.error) {
    if (active.error instanceof ApiError && active.error.status === 404) return notFound;
    return (
      <section className="records-page">
        <Link className="rd-button" to={back}>
          <ArrowLeft size={16} /> 이력 목록으로
        </Link>
        <ApiErrorState error={active.error} onRetry={active.reload} />
      </section>
    );
  }
  if (!record) return notFound;

  const productLabel = record.product_name ?? record.product_code ?? NA;
  const machineLabel = record.equipment_name || record.equipment_code;
  const inspectedAt = inspectionRecord?.inspected_at ?? null;
  const occurredAt = processRecord?.occurred_at ?? null;

  const exportInspection = () => {
    const rows: string[][] = [
      ['정밀기계검사 결과'],
      ['검사 대상', machineLabel, String(record.record_id)],
      [
        '기록 일시',
        inspectedAt ? formatDateTime(inspectedAt) : occurredAt ? formatDateTime(occurredAt) : NA,
      ],
      ['측정 항목', '측정 위치', '측정값', '하한', '상한', '단위', '판정'],
      ...measurements.map((item) => [
        item.name,
        item.point,
        NA,
        String(item.min),
        String(item.max),
        item.unit,
        NA,
      ]),
    ];
    const content =
      '\uFEFF' +
      rows
        .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `정밀기계검사_${machineLabel}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="records-page precision-page">
      {/* 다른 상세 화면과 같은 위치·모양의 뒤로 가기 링크 */}
      <Link className="rd-back" to={back}>
        <ArrowLeft size={17} /> 생산·검사 기록으로 돌아가기
      </Link>
      <div className="rd-heading">
        <div>
          {/* "정밀기계검사"는 상단 바 제목에 있으므로 제목에는 검사 대상을 쓴다 */}
          <h1>
            {productLabel} · {machineLabel}
          </h1>
          <p>
            {NA} · 기록 {record.record_id}
          </p>
        </div>
        <div className="rd-heading-actions">
          <span className="rd-api-note">검사 입력 API 준비 중</span>
          <button className="rd-button button-sm" onClick={exportInspection}>
            <Download size={16} /> 검사표 다운로드
          </button>
        </div>
      </div>
      <div className="pi-overview rd-panel">
        <div className="pi-machine">
          <span className="pi-machine-icon">
            <Cpu size={30} />
          </span>
          <div>
            <span className="rd-eyebrow">검사 대상</span>
            <h2>{machineLabel} 사출 설비</h2>
            <p>연결 검사 번호 {record.record_id}</p>
          </div>
        </div>
        <div className="pi-overview-status">
          <span className="rd-pill neutral">
            <CircleHelp size={12} /> 측정값 없음
          </span>
          <p>정밀 측정값이 API에 없어 판정을 표시할 수 없어요.</p>
        </div>
      </div>
      <div className="rd-summary">
        {[
          ['검사 항목', String(measurements.length), '개 항목'],
          ['범위 내 항목', NA, '측정값 미제공'],
          ['재확인 항목', NA, '측정값 미제공'],
          ['연결 검사 담당', NA, 'API 미제공'],
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
                <caption className="sr-only">정밀기계검사 측정 결과</caption>
                <thead>
                  <tr>
                    <th>검사 항목 / 측정 위치</th>
                    <th>허용 범위</th>
                    <th>측정값</th>
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
                      <td>
                        <span className="rd-na">{NA}</span> {item.unit}
                      </td>
                      <td>
                        <span className="rd-pill neutral">{NA}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="pi-checklist">
              {checklist.map((item) => (
                <li key={item.label}>
                  <span className="pi-check-unknown">
                    <CircleHelp size={17} />
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className="rd-pill neutral">{NA}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="pi-table-note">
            측정값이 제공되지 않아 판정을 표시하지 않습니다. 설비 운전·정비 판단에 사용하지 마세요.
          </p>
        </article>
        <aside>
          <article className="rd-panel rd-detail-card">
            <h2>검사 기본 정보</h2>
            <dl className="pi-info">
              {[
                ['검사 유형', '정밀기계검사'],
                ['설비 번호', machineLabel],
                ['연결 제품', productLabel],
                ['연결 검사일시', inspectedAt ? formatDateTime(inspectedAt) : NA],
                ['검사표 상태', NA],
                ['시연 데이터', record.is_demo ? '예' : '아니요'],
                ['기록 버전', String(record.version)],
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
            <strong>{NA}</strong>
            <p>측정값이 제공되지 않아 재확인 항목을 산출할 수 없어요.</p>
            <p>설비별 승인된 검사 기준과 측정 기록을 연결해 확인해야 합니다.</p>
          </article>
          <Link className="rd-button pi-related" to={`/records/${record.record_id}${query}`}>
            연결된 생산·검사 상세 보기 <ClipboardCheck size={16} />
          </Link>
        </aside>
      </div>
    </section>
  );
}

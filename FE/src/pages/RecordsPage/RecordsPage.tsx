import FilterSelect from '../../components/FilterSelect';
import LoadingState from '../../components/LoadingState';
import { useTransition } from 'react';
import DatePicker from '../../components/DatePicker';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Search,
  RotateCcw,
  ClipboardCheck,
  Package,
  Layers,
  Activity,
} from 'lucide-react';
import {
  defaultQualityFilters,
  defectCount,
  defectTypes,
  filterProductionRecords,
  formatRate,
  formatRecordTimestamp,
  inspectionStaff,
  percentage,
  productionInspectionRecords,
  productionRecordSummary,
  qualityEquipment,
  qualityProducts,
  qualityRangeError,
  qualityVerdict,
  recordsCsv,
} from '../../services/inspectionData';
import './RecordsPage.css';
const number = (value: number) => value.toLocaleString('ko-KR');
function download(records: typeof productionInspectionRecords) {
  const url = URL.createObjectURL(
    new Blob([recordsCsv(records)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = '사출반장_생산검사이력.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Verdict({ record }: { record: (typeof productionInspectionRecords)[number] }) {
  return (
    <span className={`rd-pill ${defectCount(record) ? 'defect' : 'good'}`}>
      {qualityVerdict(record)}
    </span>
  );
}
export default function RecordsPage() {
  const [params, rawSetParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const setParams = (...args: Parameters<typeof rawSetParams>) =>
    startTransition(() => rawSetParams(...args));
  const filters = {
    from: params.get('from') ?? defaultQualityFilters.from,
    to: params.get('to') ?? defaultQualityFilters.to,
    product: params.get('product') ?? '',
    equipment: params.get('equipment') ?? '',
    query: params.get('q') ?? '',
    inspector: params.get('inspector') ?? '',
    result: params.get('result') ?? '',
    order: params.get('order') ?? 'latest',
  };
  const update = (values: Record<string, string>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key),
      );
      next.delete('page');
      return next;
    });
  const production = params.get('view') === 'production';
  const rows = filterProductionRecords(filters);
  const summary = productionRecordSummary(rows);
  const error = qualityRangeError(filters);
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const requestedPage = Number(params.get('page'));
  const page = Math.min(pages, Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1));
  const cards = [
    {
      label: '생산 배치',
      value: number(summary.batches),
      unit: '건',
      note: '조회 조건에 해당하는 배치',
      icon: Layers,
    },
    {
      label: '생산 수량',
      value: number(summary.produced),
      unit: '개',
      note: '배치별 생산 완료 수량',
      icon: Package,
    },
    {
      label: '검사 수량',
      value: number(summary.inspected),
      unit: '개',
      note: `양품 ${number(summary.passed)}개 · 표본 검사`,
      icon: ClipboardCheck,
    },
    {
      label: '검사 불량률',
      value: formatRate(summary.rate),
      unit: '',
      note: `검사 불량 ${number(summary.defective)}개`,
      icon: Activity,
    },
  ];
  return (
    <section className="records-page" aria-busy={isPending}>
      {isPending && <LoadingState compact label="검사 데이터를 조회하는 중이에요" />}
      <div className="rd-heading">
        <div>
          <span className="rd-eyebrow">PRODUCTION & INSPECTION</span>
          <h1 className="sr-only">생산·검사 이력</h1>
          <p>생산부터 검사까지, 현장의 기록을 한곳에서 확인하세요.</p>
        </div>
        <button className="rd-button" disabled={!rows.length} onClick={() => download(rows)}>
          <Download size={16} /> 이력 다운로드
        </button>
      </div>
      <div className="rd-demo">
        <span /> 예시 데이터 <span className="rd-demo-divider">|</span> 2026.11.04–2026.11.17 · 생산
        수량은 시연용이며, 검사 불량률은 검사한 표본 기준입니다.
      </div>
      <div className="rd-panel rd-filter">
        <div className="rd-filter-title">
          <strong>조회 조건</strong>
          <button className="rd-text-button" onClick={() => setParams({})}>
            <RotateCcw size={14} /> 초기화
          </button>
        </div>
        <div className="rd-filter-grid">
          <label>
            조회 시작일
            <DatePicker
              aria-label="조회 시작일"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </label>
          <label>
            조회 종료일
            <DatePicker
              aria-label="조회 종료일"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </label>
          <label>
            제품
            <FilterSelect
              label="제품 선택"
              value={filters.product}
              onChange={(value) => update({ product: value })}
              options={[
                { value: '', label: '전체 제품' },
                ...qualityProducts.map((value) => ({ value, label: value })),
              ]}
            />
          </label>
          <label>
            설비
            <FilterSelect
              label="설비 선택"
              value={filters.equipment}
              onChange={(value) => update({ equipment: value })}
              options={[
                { value: '', label: '전체 설비' },
                ...qualityEquipment.map((value) => ({ value, label: value })),
              ]}
            />
          </label>
        </div>
        <div className="rd-presets">
          빠른 기간 선택
          {[
            ['오늘', '2026-11-17'],
            ['최근 7일', '2026-11-11'],
            ['전체 기간', '2026-11-04'],
          ].map(([label, from]) => (
            <button
              className={filters.from === from && filters.to === '2026-11-17' ? 'selected' : ''}
              key={label}
              onClick={() => update({ from, to: '2026-11-17' })}
            >
              {label}
            </button>
          ))}
        </div>
        {error && (
          <p className="rd-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="rd-summary">
        {cards.map(({ label, value, unit, note, icon: Icon }) => (
          <div className="rd-panel" key={label}>
            <span className="rd-stat-label">
              {label}
              <Icon size={17} />
            </span>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <div className="rd-panel rd-list">
        <div className="rd-list-heading">
          <div>
            <h2>
              생산·검사 기록 <span>{rows.length}</span>
            </h2>
            <p>상세 보기 버튼을 누르면 해당 배치의 생산 정보와 검사 결과가 열려요.</p>
          </div>
          {rows.length > 0 ? (
            <Link
              className="rd-button rd-primary"
              to={`/records/${rows[(page - 1) * 8].id}/precision-inspection${params.size ? `?${params}` : ''}`}
            >
              정밀기계검사 <ArrowUpRight size={16} />
            </Link>
          ) : (
            <History size={22} />
          )}
        </div>
        <div className="rd-tabs" aria-label="이력 종류">
          <button
            aria-pressed={!production}
            className={!production ? 'active' : ''}
            onClick={() => update({ view: '' })}
          >
            검사 이력
          </button>
          <button
            aria-pressed={production}
            className={production ? 'active' : ''}
            onClick={() => update({ view: 'production' })}
          >
            생산 이력
          </button>
        </div>
        <div className="rd-toolbar">
          <label className="rd-search">
            <Search size={17} />
            <input
              aria-label="이력 검색"
              placeholder="제품명, 생산 배치, 검사 번호 검색"
              value={filters.query}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <select
            aria-label="검사 담당자"
            value={filters.inspector}
            onChange={(e) => update({ inspector: e.target.value })}
          >
            <option value="">전체 담당자</option>
            {inspectionStaff.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="검사 결과"
            value={filters.result}
            onChange={(e) => update({ result: e.target.value })}
          >
            <option value="">전체 검사 결과</option>
            <option value="pass">양품</option>
            <option value="defect">불량 포함</option>
            <option value="above">기준 초과 (3%)</option>
          </select>
          <select
            aria-label="정렬"
            value={filters.order}
            onChange={(e) => update({ order: e.target.value })}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
        <div className="rd-table-wrap">
          <table>
            <caption className="sr-only">{production ? '생산' : '검사'} 이력 목록</caption>
            <thead>
              <tr>
                <th>{production ? '생산 완료' : '검사 완료'}</th>
                <th>제품 / {production ? '생산 배치' : '검사 번호'}</th>
                <th>설비</th>
                <th>{production ? '목표 / 생산 수량' : '검사 수량'}</th>
                <th>{production ? '달성률' : '불량 수량 / 불량률'}</th>
                <th>검사 결과</th>
                <th>담당자</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 8, page * 8).map((record) => (
                <tr key={record.id}>
                  <td className="rd-completed-at">
                    <span>
                      {
                        formatRecordTimestamp(
                          production ? record.finishedAt : record.inspectedAt,
                        ).split(' ')[0]
                      }
                    </span>
                    <small>
                      {
                        formatRecordTimestamp(
                          production ? record.finishedAt : record.inspectedAt,
                        ).split(' ')[1]
                      }
                    </small>
                  </td>
                  <td>
                    <strong>{record.product}</strong>
                    <small>{production ? record.lotId : record.id}</small>
                  </td>
                  <td>
                    <span className="rd-equipment">{record.equipment}</span>
                  </td>
                  <td>
                    {production
                      ? `${number(record.productionTarget)} / ${number(record.produced)}`
                      : number(record.inspected)}
                    <small>개</small>
                  </td>
                  <td className={defectCount(record) ? 'rd-defective' : ''}>
                    {production
                      ? formatRate(percentage(record.produced, record.productionTarget))
                      : `${defectCount(record)}개 / ${formatRate(percentage(defectCount(record), record.inspected))}`}
                  </td>
                  <td>
                    <Verdict record={record} />
                  </td>
                  <td>{record.inspector}</td>
                  <td>
                    <Link
                      className="rd-detail-link"
                      aria-label={`${record.id} 상세 보기`}
                      to={`/records/${record.id}${params.size ? `?${params}` : ''}`}
                    >
                      상세 보기 <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="rd-empty">
            <Search size={30} />
            <h3>{error ? '조회 기간을 확인해 주세요' : '조건에 맞는 이력이 없어요'}</h3>
            <p>조회 기간이나 검색 조건을 변경해 보세요.</p>
            <button className="rd-button" onClick={() => setParams({})}>
              조회 조건 초기화
            </button>
          </div>
        )}
        <div className="rd-pagination">
          <span>
            총 {rows.length}건
            {rows.length > 0 && ` 중 ${(page - 1) * 8 + 1}–${Math.min(page * 8, rows.length)}건`}
          </span>
          <div>
            <button
              aria-label="이전 페이지"
              disabled={page === 1}
              onClick={() =>
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set('page', String(page - 1));
                  return next;
                })
              }
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              aria-label="다음 페이지"
              disabled={page === pages}
              onClick={() =>
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set('page', String(page + 1));
                  return next;
                })
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <p className="rd-footnote">
        검사 결과는 생산 배치에서 추출한 표본 기준입니다. ‘불량 포함’은 불량이 1개 이상 있는
        배치이며, ‘기준 초과’는 검사 불량률이 3%를 넘는 배치입니다.
      </p>
    </section>
  );
}
export function RecordDetailPage() {
  const { recordId } = useParams();
  const [params] = useSearchParams();
  const record = productionInspectionRecords.find((row) => row.id === recordId);
  const back = `/records${params.size ? `?${params}` : ''}`;
  if (!record)
    return (
      <section className="records-page">
        <Link className="rd-back" to={back}>
          <ArrowLeft size={17} /> 목록으로
        </Link>
        <div className="rd-panel rd-empty">
          <h1>이력을 찾을 수 없어요</h1>
          <p>검사 번호를 확인하거나 목록에서 다시 선택해 주세요.</p>
        </div>
      </section>
    );
  const count = defectCount(record);
  const rate = percentage(count, record.inspected);
  return (
    <section className="records-page">
      <div className="rd-heading">
        <div>
          <span className="rd-eyebrow">RECORD DETAIL · 생산·검사 상세</span>
          <h1>
            {record.product} <Verdict record={record} />
          </h1>
          <p>
            {record.lotId} · {record.equipment} · {formatRecordTimestamp(record.inspectedAt)}
          </p>
        </div>
        <div className="rd-heading-actions">
          <Link
            className="rd-button"
            to={`/records/${record.id}/precision-inspection${params.size ? `?${params}` : ''}`}
          >
            정밀기계검사 <ArrowUpRight size={16} />
          </Link>
          <button className="rd-button" onClick={() => download([record])}>
            <Download size={16} /> 이력 다운로드
          </button>
          <Link className="rd-button rd-primary" to={back}>
            <ArrowLeft size={16} /> 목록으로 돌아가기
          </Link>
        </div>
      </div>
      <div className="rd-demo">
        <span /> 예시 데이터 · 생산 정보는 시연용이며 실제 설비 가동 상태를 나타내지 않습니다.
      </div>
      <div className="rd-summary">
        {[
          ['생산 수량', number(record.produced), '개'],
          ['검사 수량', number(record.inspected), '개'],
          ['검사 양품', number(record.inspected - count), '개'],
          ['검사 불량률', formatRate(rate), `불량 ${count}개`],
        ].map(([label, value, note]) => (
          <div className="rd-panel" key={label}>
            <span className="rd-stat-label">{label}</span>
            <strong>{value}</strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <div className="rd-detail-grid">
        <div>
          <article className="rd-panel rd-detail-card">
            <h2>생산·검사 정보</h2>
            <dl>
              {[
                ['생산 배치', record.lotId],
                ['검사 번호', record.id],
                ['제품', record.product],
                ['설비', record.equipment],
                ['생산 목표', `${number(record.productionTarget)}개`],
                ['목표 달성률', formatRate(percentage(record.produced, record.productionTarget))],
                ['검사 담당자', record.inspector],
                ['표본 검사 비율', formatRate(percentage(record.inspected, record.produced))],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article className="rd-panel rd-detail-card">
            <h2>검사 결과</h2>
            <div className="rd-result-top">
              <strong>양품 {record.inspected - count}개</strong>
              <span>불량 {count}개</span>
            </div>
            <div
              className="rd-result-bar"
              aria-label={`검사 ${record.inspected}개 중 불량 ${count}개`}
            >
              <span style={{ width: `${100 - (rate ?? 0)}%` }} />
            </div>
            <div className="rd-defect-grid">
              {defectTypes.map((type) => (
                <div key={type}>
                  <span>{type}</span>
                  <strong>
                    {record.defects[type]}
                    <small>개</small>
                  </strong>
                </div>
              ))}
            </div>
            <p className="rd-footnote">
              검사 표본 {record.inspected}개 기준 · 전체 생산 불량률로 해석할 수 없습니다.
            </p>
          </article>
        </div>
        <aside>
          <article className="rd-panel rd-detail-card">
            <h2>배치 처리 흐름</h2>
            <ol className="rd-timeline">
              {[
                ['생산 시작', record.startedAt],
                ['생산 완료', record.finishedAt],
                ['표본 검사 완료', record.inspectedAt],
                ['이력 저장', record.archivedAt],
              ].map(([label, time]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <time>{formatRecordTimestamp(time)}</time>
                </li>
              ))}
            </ol>
          </article>
          <article className="rd-panel rd-detail-card rd-related">
            <ClipboardCheck size={24} />
            <h2>품질 흐름도 확인해 보세요</h2>
            <p>같은 제품·설비의 검사 결과를 품질 리포트에서 확인할 수 있어요.</p>
            <Link
              className="rd-button"
              to={`/quality-reports?from=${record.date}&to=${record.date}&product=${encodeURIComponent(record.product)}&equipment=${record.equipment}`}
            >
              품질 리포트 보기 <ArrowUpRight size={16} />
            </Link>
          </article>
        </aside>
      </div>
    </section>
  );
}

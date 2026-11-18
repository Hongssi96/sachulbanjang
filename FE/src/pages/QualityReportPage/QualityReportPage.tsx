import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Download,
  FileChartColumn,
  FilterX,
  PackageSearch,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import Modal from '../../components/Modal';
import QualityTrendChart from './QualityTrendChart';
import DefectBreakdown from './DefectBreakdown';
import InspectionDetail from './InspectionDetail';
import {
  defaultQualityFilters,
  defectCount,
  defectDistribution,
  filterInspections,
  formatRate,
  inspectionThreshold,
  percentage,
  previousQualityPeriod,
  qualityByProduct,
  qualityDateLabel,
  qualityEquipment,
  qualityProducts,
  qualityRangeError,
  qualityReportLabel,
  qualityReportText,
  qualityTrend,
  qualityVerdict,
  summarizeQuality,
} from '../../services/inspectionData';
import type { InspectionBatch, QualityFilters } from '../../services/inspectionData';
import './QualityReportPage.css';

type QualityDialog =
  { kind: 'inspection'; record: InspectionBatch } | { kind: 'preview' } | { kind: 'basis' } | null;
function saveFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
export default function QualityReportPage() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<QualityDialog>(null);
  const [feedback, setFeedback] = useState('');
  const filters: QualityFilters = {
    from: params.get('from') ?? defaultQualityFilters.from,
    to: params.get('to') ?? defaultQualityFilters.to,
    product: qualityProducts.find((value) => value === params.get('product')) ?? '',
    equipment: qualityEquipment.find((value) => value === params.get('equipment')) ?? '',
  };
  const rangeError = qualityRangeError(filters);
  const records = rangeError ? [] : filterInspections(filters);
  const summary = summarizeQuality(records);
  const previousFilters = previousQualityPeriod(filters);
  const previous = summarizeQuality(previousFilters ? filterInspections(previousFilters) : []);
  const difference =
    summary.rate !== null && previous.rate !== null ? summary.rate - previous.rate : null;
  const products = qualityByProduct(records);
  const focusProducts = products
    .filter((product) => (product.rate ?? 0) > inspectionThreshold)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const focus = focusProducts[0];
  const trend = qualityTrend(records);
  const distribution = defectDistribution(records);
  const query = params.get('q') ?? '';
  const verdict = params.get('result') ?? '';
  const rows = records
    .filter(
      (record) =>
        `${record.id} ${record.product}`.toLowerCase().includes(query.trim().toLowerCase()) &&
        (verdict === 'pass'
          ? defectCount(record) === 0
          : verdict === 'defect'
            ? defectCount(record) > 0
            : verdict === 'above'
              ? (percentage(defectCount(record), record.inspected) ?? 0) > inspectionThreshold
              : true),
    )
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const pageCount = Math.max(1, Math.ceil(rows.length / 8));
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(requestedPage)
    ? Math.max(1, Math.min(pageCount, requestedPage))
    : 1;
  const visibleRows = rows.slice((page - 1) * 8, page * 8);
  const setFilter = (key: string, value: string) => {
    setParams(
      (previousParams) => {
        const next = new URLSearchParams(previousParams);
        if (value !== '' || key === 'from' || key === 'to') next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: key !== 'page' },
    );
  };
  const setPeriod = (from: string, to: string) => {
    setParams(
      (previousParams) => {
        const next = new URLSearchParams(previousParams);
        next.set('from', from);
        next.set('to', to);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  const downloadCsv = () => {
    const content = [
      [
        '검사 배치',
        '검사일',
        '검사시각',
        '제품',
        '설비',
        '검사 수량',
        '불량 수량',
        '검사 불량률',
        '결과',
        '담당자',
      ],
      ...rows.map((record) => [
        record.id,
        record.date,
        record.time,
        record.product,
        record.equipment,
        String(record.inspected),
        String(defectCount(record)),
        formatRate(percentage(defectCount(record), record.inspected)),
        qualityVerdict(record),
        record.inspector,
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    saveFile(
      `사출반장_검사이력_${filters.from}_${filters.to}.csv`,
      '\uFEFF' + content,
      'text/csv;charset=utf-8',
    );
    setFeedback(`표의 조회 결과 ${rows.length}건을 CSV로 내려받았어요.`);
  };
  const metric = (value: number) => (rangeError ? '—' : value.toLocaleString());
  return (
    <div className="quality-report-page">
      <section className="page-intro">
        <div>
          <div className="eyebrow">
            <span />
            QUALITY AT A GLANCE
          </div>
          <h1>
            품질 리포트<span className="greeting-dot">.</span>
          </h1>
          <p>검사 기록을 바탕으로, 품질의 흐름과 다음 확인 사항을 정리하세요.</p>
        </div>
        <div className="qr-intro-actions">
          <button
            className="button button-white"
            onClick={downloadCsv}
            disabled={!rows.length || !!rangeError}
          >
            <Download size={18} />
            CSV 다운로드
          </button>
          <button
            className="button button-primary"
            onClick={() => setDialog({ kind: 'preview' })}
            disabled={!records.length || !!rangeError}
          >
            <FileChartColumn size={18} />
            리포트 미리보기
          </button>
        </div>
      </section>
      {feedback && (
        <div className="qr-feedback" role="status">
          <Check size={18} />
          <span>{feedback}</span>
          <button
            className="icon-button"
            aria-label="품질 알림 닫기"
            onClick={() => setFeedback('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className="card qr-filter-card" aria-label="품질 리포트 조회 조건">
        <div className="qr-filter-heading">
          <strong>
            <CalendarDays size={18} />
            조회 조건
          </strong>
          <div className="qr-period-buttons" aria-label="품질 조회 기간">
            {[
              { label: '오늘', from: '2026-11-17' },
              { label: '최근 7일', from: '2026-11-11' },
              { label: '최근 14일', from: '2026-11-04' },
              { label: '이번 달', from: '2026-11-01' },
            ].map((period) => (
              <button
                key={period.label}
                aria-pressed={filters.from === period.from && filters.to === '2026-11-17'}
                className={
                  filters.from === period.from && filters.to === '2026-11-17' ? 'selected' : ''
                }
                onClick={() => setPeriod(period.from, '2026-11-17')}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
        <div className="qr-filter-fields">
          <fieldset>
            <legend>조회 기간</legend>
            <div className="qr-date-range">
              <input
                type="date"
                aria-label="품질 조회 시작일"
                value={filters.from}
                onChange={(event) => setFilter('from', event.target.value)}
              />
              <span>—</span>
              <input
                type="date"
                aria-label="품질 조회 종료일"
                value={filters.to}
                onChange={(event) => setFilter('to', event.target.value)}
              />
            </div>
          </fieldset>
          <label>
            제품
            <div className="qr-select">
              <select
                aria-label="품질 제품 필터"
                value={filters.product}
                onChange={(event) => setFilter('product', event.target.value)}
              >
                <option value="">전체 제품</option>
                {qualityProducts.map((product) => (
                  <option key={product}>{product}</option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          </label>
          <label>
            설비
            <div className="qr-select">
              <select
                aria-label="품질 설비 필터"
                value={filters.equipment}
                onChange={(event) => setFilter('equipment', event.target.value)}
              >
                <option value="">전체 설비</option>
                {qualityEquipment.map((equipment, index) => (
                  <option key={equipment} value={equipment}>
                    {equipment} · 사출 {index + 1}호기
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          </label>
        </div>
        {rangeError && (
          <div className="qr-range-error" role="alert">
            <TriangleAlert size={17} />
            <span>{rangeError}</span>
            <button onClick={() => setParams({})}>기간 초기화</button>
          </div>
        )}
        <p className="qr-filter-caption">
          시연 기준일 2026.11.17 · 조회 가능한 예시 검사 기록은 2026.11.04–11.17입니다.
        </p>
      </section>
      <section aria-labelledby="quality-summary-heading">
        <div className="section-top">
          <h2 id="quality-summary-heading">
            선택 기간 품질 요약
            <span className="live-label">
              <i />
              DEMO
            </span>
          </h2>
          <span className="muted">
            {rangeError
              ? '조회 기간 확인 필요'
              : `${qualityDateLabel(filters.from)}–${qualityDateLabel(filters.to)}`}
          </span>
        </div>
        <div className="kpi-grid">
          <article className="kpi">
            <div className="kpi-label">
              검사 수량
              <ClipboardCheck size={19} />
            </div>
            <div className="kpi-value">
              {metric(summary.inspected)}
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>검사 배치 {metric(summary.batches)}건</span>
              <span className="positive">선택 조건 기준</span>
            </div>
            <div className="mini-progress">
              <span style={{ width: summary.inspected ? '100%' : '0%' }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              검사 불량률
              <ShieldCheck size={19} />
            </div>
            <div className="kpi-value">
              {summary.rate === null ? '—' : summary.rate.toFixed(2)}
              {summary.rate !== null && <span>%</span>}
            </div>
            <div className="kpi-bottom">
              {difference === null ? (
                <span>
                  {rangeError
                    ? '조회 조건 확인 필요'
                    : records.length
                      ? '비교 기간 기록 없음'
                      : '검사 기록 없음'}
                </span>
              ) : (
                <span className={difference <= 0 ? 'positive' : 'qr-negative'}>
                  {difference < 0 ? (
                    <ArrowDownRight size={14} />
                  ) : difference > 0 ? (
                    <ArrowUpRight size={14} />
                  ) : null}
                  {difference === 0
                    ? '직전 기간과 동일'
                    : `직전 기간 대비 ${Math.abs(difference).toFixed(2)}%p`}
                </span>
              )}
            </div>
            <div className="kpi-caption">불량 수량 ÷ 검사 수량</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              불량 수량
              <TriangleAlert size={19} />
            </div>
            <div className="kpi-value qr-defective-value">
              {metric(summary.defective)}
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>양품 {metric(summary.passed)}개</span>
              <span>검사 결과 기준</span>
            </div>
            <div className="mini-progress qr-defect-progress">
              <span style={{ width: `${summary.rate ?? 0}%` }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              중점 확인 품목
              <Search size={19} />
            </div>
            <div className="kpi-value">
              {metric(focusProducts.length)}
              <span>개 품목</span>
              <span className={`pill ${focusProducts.length ? 'pill-amber' : 'pill-neutral'}`}>
                {!records.length ? '기록 없음' : focusProducts.length ? '확인 필요' : '기준 이하'}
              </span>
            </div>
            <div className="kpi-bottom">
              <span>제품별 검사 불량률 {inspectionThreshold}% 초과</span>
            </div>
            <div className="kpi-caption">불량 원인 확정 아님</div>
          </article>
        </div>
      </section>
      <div className="qr-analysis-grid">
        <section className="card qr-trend-card">
          <div className="card-heading">
            <div>
              <h2>품질 추이</h2>
              <p>날짜별 검사 불량률의 변화를 확인하세요.</p>
            </div>
            <div className="qr-chart-legend">
              <span>
                <i />
                검사 불량률
              </span>
              <span>
                <i />
                점검 기준 {inspectionThreshold}%
              </span>
            </div>
          </div>
          {trend.length ? (
            <>
              <div className="qr-chart-summary">
                <strong>{formatRate(summary.rate)}</strong>
                <span>기간 전체 검사 불량률</span>
              </div>
              <QualityTrendChart points={trend} />
              <div className="qr-chart-footnote">
                <span>검사 기록이 있는 날짜만 표시</span>
                <span>기간 비율은 수량을 합산해 계산합니다.</span>
              </div>
            </>
          ) : (
            <div className="qr-empty">
              <PackageSearch size={36} />
              <strong>표시할 검사 기록이 없어요</strong>
              <p>조회 기간이나 제품·설비 조건을 확인해 주세요.</p>
            </div>
          )}
        </section>
        <section className="card qr-distribution-card">
          <div className="card-heading">
            <div>
              <h2>불량 유형 분포</h2>
              <p>
                {summary.inspected
                  ? `불량 ${summary.defective.toLocaleString()}개 기준`
                  : '선택 기간 검사 기록 기준'}
              </p>
            </div>
            <span className="pill pill-neutral">
              {distribution.filter((item) => item.count > 0).length}유형
            </span>
          </div>
          {records.length ? (
            <DefectBreakdown items={distribution} />
          ) : (
            <div className="qr-empty">
              <PackageSearch size={36} />
              <strong>검사 기록이 없어요</strong>
              <p>불량 유형을 집계할 데이터가 없습니다.</p>
            </div>
          )}
        </section>
      </div>
      <section className="qr-observation">
        <div className="qr-observation-icon">
          <Sparkles size={23} />
        </div>
        <div>
          <span className="qr-observation-label">이번 기간 품질 체크</span>
          <h2>
            {focus
              ? `${focus.product} 검사 이력을 먼저 확인해 보세요.`
              : records.length
                ? '선택 범위에 기준을 초과한 품목이 없어요.'
                : '조회 조건에 맞는 검사 기록이 없어요.'}
          </h2>
          <p>
            {focus
              ? `검사 ${focus.inspected.toLocaleString()}개 중 불량 ${focus.defective}개(${formatRate(focus.rate)})가 기록됐어요. 해당 기간의 공정 조건과 조치 이력을 함께 살펴보세요.`
              : records.length
                ? '검사 결과는 선택한 기간과 조건에 한정됩니다. 이후 검사 결과도 함께 확인해 주세요.'
                : '다른 조회 기간이나 제품·설비를 선택해 확인해 주세요.'}
          </p>
        </div>
        <button
          className="button button-white"
          disabled={!records.length}
          onClick={() => setDialog({ kind: 'basis' })}
        >
          분석 근거 확인
          <ArrowUpRight size={17} />
        </button>
      </section>
      <section className="card qr-history-card" aria-labelledby="quality-history-heading">
        <div className="qr-history-header">
          <div className="heading-inline">
            <h2 id="quality-history-heading">최근 검사 이력</h2>
            <span className="pill pill-neutral">{records.length}건</span>
          </div>
          <span>검사 배치 단위</span>
        </div>
        <div className="qr-table-toolbar">
          <label className="qr-search">
            <Search size={18} />
            <input
              aria-label="검사 기록 검색"
              value={query}
              onChange={(event) => setFilter('q', event.target.value)}
              placeholder="검사 번호 또는 제품명 검색"
            />
            {query && (
              <button aria-label="검사 검색어 지우기" onClick={() => setFilter('q', '')}>
                <X size={15} />
              </button>
            )}
          </label>
          <div className="qr-select">
            <select
              aria-label="검사 결과 필터"
              value={['pass', 'defect', 'above'].includes(verdict) ? verdict : ''}
              onChange={(event) => setFilter('result', event.target.value)}
            >
              <option value="">전체 검사 결과</option>
              <option value="pass">양품 배치</option>
              <option value="defect">불량 포함 배치</option>
              <option value="above">기준 초과 배치</option>
            </select>
            <ChevronDown size={15} />
          </div>
          <span>표 검색·결과 필터는 요약 지표에 영향을 주지 않습니다.</span>
        </div>
        <div className="qr-table-scroll" role="region" tabIndex={0} aria-label="최근 검사 이력 표">
          <table className="qr-history-table">
            <caption className="sr-only">
              검사 배치별 수량과 불량률. 검사 불량률은 불량 수량을 검사 수량으로 나눈 값입니다.
            </caption>
            <thead>
              <tr>
                <th scope="col">검사 일시</th>
                <th scope="col">제품 / 검사 번호</th>
                <th scope="col">설비</th>
                <th scope="col" className="qr-number">
                  검사 수량
                </th>
                <th scope="col" className="qr-number">
                  불량 수량
                </th>
                <th scope="col" className="qr-number">
                  검사 불량률
                </th>
                <th scope="col">검사 결과</th>
                <th scope="col">담당자</th>
                <th scope="col">
                  <span className="sr-only">상세</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((record) => (
                <tr key={record.id}>
                  <td className="qr-time-cell">
                    <strong>{qualityDateLabel(record.date)}</strong>
                    <small>{record.time}</small>
                  </td>
                  <td>
                    <button
                      className="qr-product-cell"
                      onClick={() => setDialog({ kind: 'inspection', record })}
                    >
                      <strong>{record.product}</strong>
                      <small>{record.id}</small>
                    </button>
                  </td>
                  <td className="qr-equipment-cell">{record.equipment}</td>
                  <td className="qr-number">{record.inspected.toLocaleString()}</td>
                  <td
                    className={`qr-number ${defectCount(record) ? 'qr-defect-number' : 'qr-muted-number'}`}
                  >
                    {defectCount(record)}
                  </td>
                  <td
                    className={`qr-number ${(percentage(defectCount(record), record.inspected) ?? 0) > inspectionThreshold ? 'qr-defect-number' : ''}`}
                  >
                    {formatRate(percentage(defectCount(record), record.inspected))}
                  </td>
                  <td>
                    <span
                      className={`pill ${qualityVerdict(record) === '양품' ? 'pill-green' : qualityVerdict(record) === '기준 초과' ? 'qr-pill-danger' : 'pill-amber'}`}
                    >
                      {qualityVerdict(record) === '양품' ? (
                        <Check size={12} />
                      ) : (
                        <TriangleAlert size={12} />
                      )}
                      {qualityVerdict(record)}
                    </span>
                  </td>
                  <td className="qr-inspector">{record.inspector}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`${record.id} 검사 상세`}
                      onClick={() => setDialog({ kind: 'inspection', record })}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="qr-empty qr-table-empty">
              <PackageSearch size={36} />
              <strong>조건에 맞는 검사 이력이 없어요</strong>
              <p>{rangeError || '조회 조건이나 검색어를 바꿔 다시 확인해 주세요.'}</p>
              <button className="button button-white" onClick={() => setParams({})}>
                <FilterX size={16} />
                조회 조건 초기화
              </button>
            </div>
          )}
        </div>
        <div className="qr-table-footer">
          <span>
            전체 <strong>{rows.length}건</strong>
            {rows.length > 0 && ` 중 ${(page - 1) * 8 + 1}–${Math.min(page * 8, rows.length)}건`}
          </span>
          <div className="qr-pagination">
            <button
              className="icon-button"
              aria-label="검사 이력 이전 페이지"
              disabled={page === 1}
              onClick={() => setFilter('page', String(page - 1))}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {page} <small>/ {pageCount}</small>
            </span>
            <button
              className="icon-button"
              aria-label="검사 이력 다음 페이지"
              disabled={page === pageCount}
              onClick={() => setFilter('page', String(page + 1))}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
      <footer className="page-footer qr-page-footer">
        <span>검사 불량률은 제공된 검사 수량 기준이며 전체 생산 불량률과 다릅니다.</span>
        <span>예시 데이터 · 실제 AI·공정 시스템 미연동</span>
      </footer>
      {dialog && (
        <Modal
          title={
            dialog.kind === 'inspection'
              ? '검사 배치 상세'
              : dialog.kind === 'preview'
                ? `${qualityReportLabel(filters)} 품질 리포트`
                : '품질 체크 · 분석 근거'
          }
          onClose={() => setDialog(null)}
          wide={dialog.kind === 'preview'}
        >
          {dialog.kind === 'inspection' && <InspectionDetail record={dialog.record} />}
          {dialog.kind === 'preview' && (
            <div className="qr-report-preview">
              <div className="qr-preview-brand">
                <FileChartColumn size={24} />
                <strong>
                  사출반장 <span>QUALITY REPORT</span>
                </strong>
                <span className="pill pill-violet">시연용</span>
              </div>
              <h3>{qualityReportLabel(filters)} 품질 리포트</h3>
              <p className="qr-preview-scope">
                {qualityDateLabel(filters.from)}–{qualityDateLabel(filters.to)}
                <br />
                {filters.product || '전체 제품'} · {filters.equipment || '전체 설비'}
              </p>
              <div className="qr-detail-values">
                <div>
                  <span>검사 수량</span>
                  <strong>
                    {summary.inspected.toLocaleString()}
                    <small>개</small>
                  </strong>
                </div>
                <div>
                  <span>불량 수량</span>
                  <strong>
                    {summary.defective}
                    <small>개</small>
                  </strong>
                </div>
                <div>
                  <span>검사 불량률</span>
                  <strong>{formatRate(summary.rate)}</strong>
                </div>
              </div>
              <h4>제품별 검사 요약</h4>
              <div className="qr-preview-products">
                {products.map((product) => (
                  <div key={product.product}>
                    <strong>{product.product}</strong>
                    <span>
                      검사 {product.inspected.toLocaleString()}개 · 불량 {product.defective}개
                    </span>
                    <b>{formatRate(product.rate)}</b>
                  </div>
                ))}
              </div>
              <h4>주요 확인 사항</h4>
              <p className="qr-preview-body">
                {focus
                  ? `${focus.product}의 검사 불량률이 ${formatRate(focus.rate)}로 점검 기준 ${inspectionThreshold}%를 초과했습니다. 해당 기간의 공정 조건 및 조치 이력을 우선 확인해 주세요.`
                  : '선택한 검사 범위에서는 점검 기준을 초과한 제품이 없습니다.'}
              </p>
              <p className="qr-preview-note">
                이 리포트는 시연용 검사 배치 데이터에 기반합니다. 불량 원인이나 전체 생산 품질을
                확정하지 않습니다.
              </p>
              <button
                className="button button-primary qr-report-save"
                onClick={() => {
                  saveFile(
                    `사출반장_${qualityReportLabel(filters)}품질리포트_${filters.to}.txt`,
                    qualityReportText(filters, records),
                    'text/plain;charset=utf-8',
                  );
                  setFeedback('선택 조건의 품질 리포트를 텍스트로 내려받았어요.');
                }}
              >
                <Download size={18} />
                텍스트 리포트 저장
              </button>
            </div>
          )}
          {dialog.kind === 'basis' && (
            <div className="qr-basis">
              <CircleHelp size={30} />
              <h3>어떤 기준으로 확인하나요?</h3>
              <p>
                상단 조회 조건에 해당하는 검사 배치를 제품별로 합산하고, 검사 불량률이{' '}
                {inspectionThreshold}%를 초과하는 품목을 중점 확인 대상으로 표시합니다.
              </p>
              <div className="modal-callout">
                <strong>검사 불량률 = 불량 수량 ÷ 검사 수량 × 100</strong>
                <p>
                  날짜별 불량률의 단순 평균을 사용하지 않습니다. 이전 기간 비교는 같은 길이의 바로
                  앞 기간을 사용하며, 같은 제품·설비 조건으로 계산합니다.
                </p>
              </div>
              {focusProducts.map((product) => (
                <div className="qr-basis-product" key={product.product}>
                  <strong>{product.product}</strong>
                  <p>
                    검사 {product.inspected.toLocaleString()}개 · 불량 {product.defective}개 ·{' '}
                    {formatRate(product.rate)}
                  </p>
                  <button
                    className="text-link"
                    onClick={() => {
                      setFilter('product', product.product);
                      setDialog(null);
                      document
                        .getElementById('quality-history-heading')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    해당 제품 검사 보기
                    <ArrowRight size={15} />
                  </button>
                </div>
              ))}
              <p className="qr-preview-note">
                모든 기록은 예시 데이터입니다. 관찰된 차이는 불량 원인을 증명하지 않으며, 실제 공정
                조건과 현장 조치를 함께 검토해야 합니다.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

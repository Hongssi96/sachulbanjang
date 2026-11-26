import { usePageEntryReady } from '../../components/PageEntry/PageEntryContext';
import FilterSelect from '../../components/FilterSelect';
import LoadingState from '../../components/LoadingState';
import SegmentedControl from '../../components/SegmentedControl';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  FilterX,
  MapPin,
  Package,
  PackageCheck,
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react';
import Modal from '../../components/Modal';
import ApiErrorState from '../../components/ApiErrorState';
import MissingValue from '../../components/MissingValue';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useAuth } from '../../hooks/useAuth';
import {
  confirmMovement,
  createMovement,
  createMovementCorrection,
  fetchMovements,
  fetchStocks,
  setMinimumStock,
} from '../../api/inventory';
import type { MovementItem } from '../../api/inventory';
import StockDetail from './StockDetail';
import StockMovementForm, { StockCorrectionForm } from './StockMovementForm';
import type { MovementFormValues } from './StockMovementForm';
import {
  fetchAllStocks,
  formatMinimumStock,
  formatStockDate,
  inventorySummary,
  movementAmount,
  movementFilterKind,
  movementKindLabel,
  movementSymbol,
  movementTone,
  NOT_AVAILABLE,
  stockStatus,
} from './inventoryModel';
import type { MovementFilter } from './inventoryModel';
import './InventoryPage.css';

// API가 제품군·창고 값을 제공하지 않아 원본 화면의 필터 선택지만 유지한다.
const PRODUCT_GROUPS = ['CN7', 'RG3', 'JX1', 'SP2'] as const;
const WAREHOUSES = ['A창고', 'B창고', 'C창고'] as const;
const PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 50;

type DialogState =
  | { kind: 'movement'; productId?: number }
  | { kind: 'detail'; productId: number }
  | { kind: 'history' }
  | { kind: 'correct'; movement: MovementItem }
  | { kind: 'help' }
  | null;
export default function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [params, rawSetParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const setParams = (...args: Parameters<typeof rawSetParams>) =>
    startTransition(() => rawSetParams(...args));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [feedback, setFeedback] = useState('');
  const [historyKind, setHistoryKind] = useState<MovementFilter>('all');
  const [refreshToken, setRefreshToken] = useState(0);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);
  const refresh = () => setRefreshToken((value) => value + 1);
  const query = params.get('q') ?? '';
  const product = PRODUCT_GROUPS.find((value) => value === params.get('product')) ?? '';
  const warehouse = WAREHOUSES.find((value) => value === params.get('warehouse')) ?? '';
  const onlyLow = params.get('status') === 'low';
  const revealLowStock = useRef(false);
  useEffect(() => {
    if (!onlyLow || isPending || !revealLowStock.current) return;
    revealLowStock.current = false;
    document
      .getElementById('inventory-table-heading')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [onlyLow, isPending, params]);
  const order = params.get('sort');
  // 가용재고 정렬은 오름차순 → 내림차순 → 해제 순서로 세 번에 한 번씩 반복한다.
  const sortLabel =
    order === 'available-asc' ? '오름차순' : order === 'available-desc' ? '내림차순' : '기본';
  const nextOrder =
    order === 'available-asc'
      ? 'available-desc'
      : order === 'available-desc'
        ? ''
        : 'available-asc';
  const sortActive = order === 'available-asc' || order === 'available-desc';
  const requested = Number(params.get('page'));
  const requestedPage = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const stocksQuery = useApiQuery(
    `inventory-stocks:${query}:${onlyLow}:${requestedPage}:${refreshToken}`,
    () =>
      fetchStocks({
        q: query || undefined,
        lowStock: onlyLow,
        page: requestedPage,
        pageSize: PAGE_SIZE,
      }),
  );
  // KPI·부족 알림·품목 선택지는 페이지와 무관한 전체 목록이 필요하다.
  const allStocksQuery = useApiQuery(`inventory-stocks-all:${refreshToken}`, fetchAllStocks);
  const recentQuery = useApiQuery(`inventory-movements-recent:${historyKind}:${refreshToken}`, () =>
    fetchMovements({ kind: movementFilterKind(historyKind), pageSize: 5 }),
  );
  usePageEntryReady([stocksQuery, allStocksQuery, recentQuery].every((query) => !query.loading));
  const historyQuery = useApiQuery(
    `inventory-movements-history:${refreshToken}`,
    () => fetchMovements({ pageSize: HISTORY_PAGE_SIZE }),
    { enabled: dialog?.kind === 'history' },
  );
  const detailProductId = dialog?.kind === 'detail' ? dialog.productId : undefined;
  const detailMovementsQuery = useApiQuery(
    `inventory-movements-detail:${detailProductId ?? 'none'}:${refreshToken}`,
    () =>
      fetchMovements({
        productId: detailProductId,
        pageSize: 5,
      }),
    { enabled: detailProductId !== undefined },
  );
  const allStocks = allStocksQuery.data;
  const summary = inventorySummary(allStocks ?? []);
  const itemCount = allStocks === null ? null : allStocks.length;
  const lowItems = (allStocks ?? []).filter((item) => item.is_low_stock);
  const rows = stocksQuery.data?.items ?? [];
  const totalItems = stocksQuery.data?.pagination.total_items ?? 0;
  const totalPages = stocksQuery.data?.pagination.total_pages ?? 0;
  const page = Math.min(requestedPage, Math.max(1, totalPages));
  const detailItem =
    detailProductId === undefined
      ? undefined
      : allStocks?.find((item) => item.product_id === detailProductId);
  const groupedStock = PRODUCT_GROUPS.map((group) => ({ group }));
  const setFilter = (key: string, value: string) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        // 조건이 바뀌면 첫 페이지로 돌아간다.
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  const {
    input: queryInput,
    setInput: setQueryInput,
    searchNow: clearQuery,
    compositionHandlers,
  } = useDebouncedSearch({
    value: query,
    onSearch: (value) => setFilter('q', value),
  });
  const saveMovement = async (values: MovementFormValues) => {
    const result = await createMovement({
      productId: values.productId,
      kind: values.kind,
      quantity: values.quantity,
      reason: values.reason,
    });
    const target = (allStocks ?? []).find((item) => item.product_id === values.productId);
    setFeedback(
      `${target?.name ?? '품목'} ${Math.abs(result.delta).toLocaleString()}개 ${movementKindLabel(result.kind)} 기록을 저장했어요.`,
    );
    refresh();
    setDialog(null);
  };
  const updateSafety = async (productId: number, value: number) => {
    await setMinimumStock(productId, value);
    setFeedback('안전재고 기준을 변경했어요.');
    refresh();
  };
  const confirm = async (movement: MovementItem) => {
    setPendingActionId(movement.movement_id);
    try {
      await confirmMovement(movement.movement_id);
      setFeedback('입출고 기록을 확인했어요.');
      refresh();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : '입출고 기록을 확인하지 못했어요.');
    } finally {
      setPendingActionId(null);
    }
  };
  const submitCorrection = async (delta: number, reason: string) => {
    if (dialog?.kind !== 'correct') return;
    await createMovementCorrection(dialog.movement.movement_id, { delta, reason });
    setFeedback('입출고 기록을 정정했어요.');
    refresh();
    setDialog(null);
  };
  const download = () => {
    const cells = [
      [
        '품목 코드',
        '제품명',
        '현재고',
        '출고 예약',
        '가용재고',
        '안전재고',
        '창고',
        '보관 위치',
        '상태',
      ],
      ...rows.map((item) => [
        item.product_code ?? NOT_AVAILABLE,
        item.name,
        String(item.quantity),
        NOT_AVAILABLE,
        NOT_AVAILABLE,
        item.minimum_stock === null ? '미설정' : String(item.minimum_stock),
        NOT_AVAILABLE,
        NOT_AVAILABLE,
        stockStatus(item.is_low_stock),
      ]),
    ];
    const csv =
      '\uFEFF' +
      cells
        .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '사출반장_완제품재고.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback(`조회 결과 ${rows.length}개 품목을 CSV로 내려받았어요.`);
  };
  const movementList = (movements: MovementItem[], withActions = false) => (
    <div className="inv-movement-list">
      {movements.length ? (
        movements.map((movement) => {
          const tone = movementTone(movement.delta);
          const canConfirm = isAdmin && !movement.checked_at;
          const canCorrect =
            movement.kind !== 'correction' &&
            !movement.checked_at &&
            (isAdmin || movement.actor_id === user?.id);
          return (
            <div className="inv-movement-row" key={movement.movement_id}>
              <span className={`inv-movement-icon ${tone}`}>
                {tone === 'in' ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
              </span>
              <div>
                <strong>
                  {movement.product_name}
                  <span>{movementKindLabel(movement.kind)}</span>
                  {movement.checked_at && <span>확인 완료</span>}
                </strong>
                <small>
                  {formatStockDate(movement.created_at)} · {movement.actor_display_name}
                  {movement.reason ? ` · ${movement.reason}` : ''}
                </small>
              </div>
              <span className={`inv-movement-quantity ${tone === 'in' ? 'in' : ''}`}>
                {movementSymbol(movement.delta)}
                {movementAmount(movement.delta)}
                <small>개</small>
              </span>
              {withActions && (canConfirm || canCorrect) && (
                <div className="inv-movement-actions">
                  {canConfirm && (
                    <button
                      className="text-link"
                      type="button"
                      disabled={pendingActionId === movement.movement_id}
                      onClick={() => void confirm(movement)}
                    >
                      확인
                    </button>
                  )}
                  {canCorrect && (
                    <button
                      className="text-link"
                      type="button"
                      disabled={pendingActionId === movement.movement_id}
                      onClick={() => setDialog({ kind: 'correct', movement })}
                    >
                      정정
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <p className="empty-text">해당하는 입출고 기록이 없어요.</p>
      )}
    </div>
  );
  const dialogTitle =
    dialog?.kind === 'movement'
      ? '완제품 입출고 등록'
      : dialog?.kind === 'detail'
        ? '품목 재고 상세'
        : dialog?.kind === 'history'
          ? '입출고 이력'
          : dialog?.kind === 'correct'
            ? '입출고 기록 정정'
            : '재고 기준 안내';
  return (
    <div className="inventory-page">
      <h1 className="sr-only">재고 관리</h1>
      {feedback && (
        <div className="inv-feedback" role="status">
          <Check size={18} />
          <span>{feedback}</span>
          <button
            className="icon-button"
            aria-label="재고 알림 닫기"
            onClick={() => setFeedback('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {allStocksQuery.error ? (
        <ApiErrorState compact error={allStocksQuery.error} onRetry={allStocksQuery.reload} />
      ) : allStocks === null ? null : (
        <div className={`inv-stock-alert ${lowItems.length ? '' : 'inv-stock-safe'}`}>
          <span className="inv-alert-tag">
            {lowItems.length ? <TriangleAlert size={16} /> : <ShieldCheck size={16} />}
            {lowItems.length ? '재고 부족' : '재고 정상'}
          </span>
          <p>
            {lowItems.length ? (
              <>
                <strong>{lowItems.map((item) => item.name).join(', ')}</strong>의 가용재고가
                안전재고 기준에 미달합니다.
              </>
            ) : (
              <strong>모든 품목의 가용재고가 안전재고 기준을 충족하고 있어요.</strong>
            )}
          </p>
          {lowItems.length > 0 && (
            <button
              onClick={() => {
                revealLowStock.current = true;
                setParams({ status: 'low' });
              }}
            >
              부족 재고 확인
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      <section aria-labelledby="inventory-summary-title">
        <div className="kpi-grid">
          <article className="kpi">
            <div className="kpi-label">
              현재고
              <Boxes size={19} />
            </div>
            <div className="kpi-value">
              {allStocks === null ? NOT_AVAILABLE : summary.stock.toLocaleString()}
              {allStocks !== null && <span>개</span>}
            </div>
            <div className="kpi-bottom">
              <span>보관 중인 전체 완제품</span>
              <span className="positive">
                {itemCount === null ? NOT_AVAILABLE : `${itemCount}개 품목`}
              </span>
            </div>
            <div className="mini-progress">
              <span style={{ width: '100%' }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              가용재고
              <PackageCheck size={19} />
            </div>
            <div className="kpi-value">
              <MissingValue size="lg" />
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>현재고 − 출고 예약</span>
              <span className="positive">즉시 출고 가능</span>
            </div>
            <div className="mini-progress">
              <span style={{ width: '0%' }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              출고 예약
              <Truck size={19} />
            </div>
            <div className="kpi-value">
              <MissingValue size="lg" />
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>납품을 위해 확보한 수량</span>
              <span>예약 제외 후 출고</span>
            </div>
            <div className="mini-progress inv-reserved-progress">
              <span style={{ width: '0%' }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              부족·품절 품목
              <TriangleAlert size={19} />
            </div>
            <div className="kpi-value">
              {allStocks === null ? NOT_AVAILABLE : summary.low}
              {allStocks !== null && (
                <>
                  <span>개 품목</span>
                  <span className={`pill ${summary.low ? 'pill-amber' : 'pill-green'}`}>
                    {summary.low ? '확인 필요' : '재고 정상'}
                  </span>
                </>
              )}
            </div>
            <div className="kpi-bottom">
              <span>가용재고와 안전재고 비교</span>
              <button
                className="text-link"
                aria-label="부족 품목만 보기"
                onClick={() => setParams({ status: 'low' })}
              >
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="kpi-caption">품절은 가용재고 0개 기준</div>
          </article>
        </div>
      </section>
      <section className="card inv-stock-card" aria-labelledby="inventory-table-heading">
        <div className="inv-stock-header">
          <div className="heading-inline">
            <h2 id="inventory-table-heading">품목별 재고 현황</h2>
            <span className="pill pill-neutral">
              {itemCount === null ? NOT_AVAILABLE : `${itemCount}품목`}
            </span>
          </div>
          <div className="inv-intro-actions">
            <button className="text-link" onClick={() => setDialog({ kind: 'help' })}>
              <CircleHelp size={16} />
              재고 기준 안내
            </button>
            <button
              className="button button-white button-sm"
              onClick={download}
              disabled={!rows.length}
            >
              <Download size={18} />
              재고 다운로드
            </button>
            <button
              className="button button-primary button-sm"
              onClick={() => setDialog({ kind: 'movement' })}
            >
              <Plus size={18} />
              입출고 등록
            </button>
          </div>
        </div>
        <div className="inv-category-bar">
          <div className="inv-category">
            <Package size={18} />
            완제품<span>{itemCount === null ? NOT_AVAILABLE : itemCount}</span>
          </div>
          <span className="inv-category-future">
            원자재 <small>추후 지원</small>
          </span>
          <span className="inv-last-update">마지막 갱신 {NOT_AVAILABLE}</span>
        </div>
        <div className="inv-filter-bar">
          <label className="inv-search">
            <Search size={18} />
            <input
              aria-label="재고 품목 검색"
              placeholder="제품명 또는 품목 코드 검색"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              {...compositionHandlers}
            />
            {queryInput && (
              <button aria-label="검색어 지우기" onClick={() => clearQuery('')}>
                <X size={15} />
              </button>
            )}
          </label>
          <div className="inv-filter-select">
            <FilterSelect
              label="재고 제품 필터"
              value={product}
              onChange={(value) => setFilter('product', value)}
              options={[
                { value: '', label: '전체 제품' },
                ...PRODUCT_GROUPS.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <div className="inv-filter-select">
            <FilterSelect
              label="재고 창고 필터"
              value={warehouse}
              onChange={(value) => setFilter('warehouse', value)}
              options={[
                { value: '', label: '전체 창고' },
                ...WAREHOUSES.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <SegmentedControl
            label="재고 상태 필터"
            size="md"
            className="inv-status-filter"
            value={onlyLow ? 'low' : 'all'}
            options={[
              { value: 'all', label: '전체' },
              {
                value: 'low',
                label: '부족·품절',
                count: allStocks === null ? undefined : summary.low,
                countTone: 'warning',
              },
            ]}
            onChange={(value) => setFilter('status', value === 'low' ? 'low' : '')}
          />
        </div>
        {(product || warehouse) && (
          <p className="inv-api-note" role="status">
            제품군·창고 정보는 API에서 제공되지 않아 선택한 조건은 조회 결과에 적용되지 않아요. 해당
            조건의 품목이 없을 수 있어요.
          </p>
        )}
        {sortActive && (
          <p className="inv-api-note" role="status">
            가용재고 값이 API에 없어 정렬은 표시 순서에 반영되지 않아요.
          </p>
        )}
        {onlyLow && (
          <div className="inv-shortage-summary" role="status">
            <strong>부족·품절 품목 {rows.length}개 표시 중</strong>
            {rows.map((item) => (
              <span key={item.product_id}>
                {item.name} · 가용 {NOT_AVAILABLE} / 안전 {formatMinimumStock(item.minimum_stock)} ·
                부족 {NOT_AVAILABLE}
              </span>
            ))}
          </div>
        )}
        {stocksQuery.error ? (
          <ApiErrorState error={stocksQuery.error} onRetry={stocksQuery.reload} />
        ) : (
          <div
            className="inv-table-scroll"
            // 필터 결과 수가 달라져도 표 영역 높이는 유지한다(행 64px + 구분선 1px).
            style={{ minHeight: `${56 + Math.max(rows.length, 1) * 65}px` }}
            tabIndex={0}
            role="region"
            aria-label="품목별 재고 표"
          >
            <table className="inv-stock-table">
              <caption className="sr-only">
                완제품 재고 현황. 가용재고는 현재고에서 출고 예약을 뺀 수량입니다.
              </caption>
              <thead>
                <tr>
                  <th scope="col">제품 / 품목 코드</th>
                  <th scope="col" className="inv-number">
                    현재고
                  </th>
                  <th scope="col" className="inv-number">
                    출고 예약
                  </th>
                  <th
                    scope="col"
                    className="inv-number"
                    aria-sort={
                      order === 'available-asc'
                        ? 'ascending'
                        : order === 'available-desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      aria-label={`가용재고 정렬: ${sortLabel}`}
                      onClick={() => setFilter('sort', nextOrder)}
                    >
                      가용재고
                      {order === 'available-asc' ? (
                        <ArrowUp size={14} />
                      ) : order === 'available-desc' ? (
                        <ArrowDown size={14} />
                      ) : (
                        <ArrowDownUp size={14} />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="inv-number">
                    안전재고
                  </th>
                  <th scope="col">보관 위치</th>
                  <th scope="col">상태</th>
                  <th scope="col">상세</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.product_id}>
                    <td>
                      <button
                        className="inv-product-cell"
                        onClick={() => setDialog({ kind: 'detail', productId: item.product_id })}
                      >
                        <span className={`inv-product-icon ${item.is_low_stock ? 'warning' : ''}`}>
                          <Package size={18} />
                        </span>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.product_code ?? NOT_AVAILABLE}</small>
                        </span>
                      </button>
                    </td>
                    <td className="inv-number">{item.quantity.toLocaleString()}</td>
                    <td className="inv-number inv-muted-number">
                      <MissingValue />
                    </td>
                    <td
                      className={`inv-number inv-available ${item.is_low_stock ? 'warning' : ''}`}
                    >
                      <MissingValue />
                    </td>
                    <td className="inv-number inv-muted-number">
                      {formatMinimumStock(item.minimum_stock)}
                    </td>
                    <td>
                      <span className="inv-warehouse">
                        <MapPin size={13} />
                        {NOT_AVAILABLE}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${item.is_low_stock ? 'pill-amber' : 'pill-green'}`}>
                        {item.is_low_stock ? <TriangleAlert size={12} /> : <Check size={12} />}
                        {stockStatus(item.is_low_stock)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="inv-detail-link"
                        aria-label={`${item.name} 상세 보기`}
                        onClick={() => setDialog({ kind: 'detail', productId: item.product_id })}
                      >
                        상세 보기 <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stocksQuery.loading && !rows.length && (
              <div className="inv-empty">
                <PackageSearch size={36} />
                <h3>조건에 맞는 재고가 없어요</h3>
                <p>검색어나 조회 조건을 바꿔 다시 확인해 주세요.</p>
                <button className="button button-white button-sm" onClick={() => setParams({})}>
                  <FilterX size={16} />
                  필터 초기화
                </button>
              </div>
            )}
          </div>
        )}
        <div className="inv-table-footer">
          <span>
            전체 {totalItems}개 중 <strong>{rows.length}개</strong> 품목
          </span>
          {totalPages > 1 && (
            <nav className="inv-pager" aria-label="페이지 이동">
              <button
                type="button"
                aria-label="이전 페이지"
                disabled={page === 1}
                onClick={() => setFilter('page', String(page - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="다음 페이지"
                disabled={page === totalPages}
                onClick={() => setFilter('page', String(page + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
          <button
            className="text-link"
            style={{ visibility: params.size > 0 ? 'visible' : 'hidden' }}
            disabled={params.size === 0}
            onClick={() => setParams({})}
          >
            <FilterX size={14} /> 초기화
          </button>
        </div>
      </section>
      <div className="inv-bottom-grid">
        <section className="card">
          <div className="card-heading">
            <div className="heading-inline">
              <h2>최근 입출고</h2>
              <span className="pill pill-neutral">
                {recentQuery.data === null
                  ? NOT_AVAILABLE
                  : recentQuery.data.pagination.total_items}
              </span>
            </div>
            <button className="text-link" onClick={() => setDialog({ kind: 'history' })}>
              전체 이력
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="inv-history-filters" aria-label="입출고 이력 필터">
            {[
              { label: '전체', value: 'all' },
              { label: '입고', value: 'in' },
              { label: '출고', value: 'out' },
            ].map((filter) => (
              <button
                key={filter.value}
                aria-pressed={historyKind === filter.value}
                className={historyKind === filter.value ? 'selected' : ''}
                onClick={() => setHistoryKind(filter.value as MovementFilter)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {recentQuery.error ? (
            <ApiErrorState compact error={recentQuery.error} onRetry={recentQuery.reload} />
          ) : recentQuery.loading && !recentQuery.data ? (
            <LoadingState compact label="입출고 기록을 불러오는 중이에요" />
          ) : (
            movementList(recentQuery.data?.items ?? [])
          )}
        </section>
        <section className="card inv-product-summary">
          <div className="card-heading">
            <div>
              <h2>제품군별 재고</h2>
            </div>
            <span className="inv-bar-unit">단위: 개</span>
          </div>
          <div className="inv-stock-legend">
            <span>
              <i />
              가용재고
            </span>
            <span>
              <i />
              출고 예약
            </span>
          </div>
          <div className="inv-product-bars">
            {groupedStock.map((group) => (
              <button
                key={group.group}
                onClick={() => {
                  setParams({ product: group.group });
                  document
                    .getElementById('inventory-table-heading')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                aria-label={`${group.group} 제품군 재고 조회`}
                aria-describedby={`stock-tooltip-${group.group}`}
              >
                <span className="inv-bar-head">
                  <strong>{group.group}</strong>
                  <b>{NOT_AVAILABLE}</b>
                </span>
                <span className="inv-bar-track">
                  <span className="inv-bar-available" style={{ width: '0%' }} />
                  <span className="inv-bar-reserved" style={{ width: '0%' }} />
                </span>
                <span
                  className="inv-stock-tooltip"
                  id={`stock-tooltip-${group.group}`}
                  role="tooltip"
                >
                  <strong>{group.group} 재고 상세</strong>
                  <span>
                    현재고 <b>{NOT_AVAILABLE}</b>
                  </span>
                  <span>
                    출고 예약 <b>{NOT_AVAILABLE}</b>
                  </span>
                  <span>
                    가용재고 <b>{NOT_AVAILABLE}</b>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <footer className="page-footer inv-page-footer">
        <span>가용재고 = 현재고 − 출고 예약 · 부족 기준 = 가용재고 &lt; 안전재고</span>
      </footer>
      {dialog && (
        <Modal title={dialogTitle} onClose={() => setDialog(null)}>
          {dialog.kind === 'movement' && (
            <StockMovementForm
              items={allStocks ?? []}
              initialItemId={dialog.productId}
              isAdmin={isAdmin}
              onSave={saveMovement}
            />
          )}
          {dialog.kind === 'detail' &&
            (detailItem ? (
              <StockDetail
                item={detailItem}
                movements={detailMovementsQuery.data?.items ?? []}
                movementsLoading={detailMovementsQuery.loading}
                movementsError={detailMovementsQuery.error}
                onRetryMovements={detailMovementsQuery.reload}
                onMove={() => setDialog({ kind: 'movement', productId: detailItem.product_id })}
                onSafetyChange={(value) => updateSafety(detailItem.product_id, value)}
              />
            ) : allStocksQuery.error ? (
              <ApiErrorState error={allStocksQuery.error} onRetry={allStocksQuery.reload} />
            ) : allStocks === null ? (
              <LoadingState label="품목 정보를 불러오는 중이에요" />
            ) : (
              <p className="empty-text">품목 정보를 찾을 수 없어요.</p>
            ))}
          {dialog.kind === 'history' && (
            <>
              <p className="muted">
                최근 {HISTORY_PAGE_SIZE}건까지 표시합니다. 전체{' '}
                {historyQuery.data?.pagination.total_items ?? NOT_AVAILABLE}건
              </p>
              {historyQuery.error ? (
                <ApiErrorState error={historyQuery.error} onRetry={historyQuery.reload} />
              ) : historyQuery.loading && !historyQuery.data ? (
                <LoadingState compact label="입출고 이력을 불러오는 중이에요" />
              ) : (
                movementList(historyQuery.data?.items ?? [], true)
              )}
            </>
          )}
          {dialog.kind === 'correct' && (
            <StockCorrectionForm movement={dialog.movement} onSave={submitCorrection} />
          )}
          {dialog.kind === 'help' && (
            <div className="inv-help">
              <PackageCheck size={32} />
              <h3>출고할 수 있는 재고부터 확인해요.</h3>
              <dl>
                <dt>현재고</dt>
                <dd>창고에 보관 중인 전체 완제품 수량</dd>
                <dt>출고 예약</dt>
                <dd>예정된 납품을 위해 확보해 둔 수량</dd>
                <dt>가용재고</dt>
                <dd>현재고에서 출고 예약을 뺀 실제 출고 가능 수량</dd>
                <dt>안전재고</dt>
                <dd>품목별로 유지해야 하는 최소 가용재고</dd>
              </dl>
              <div className="modal-callout">
                <p>
                  가용재고가 0이면 ‘품절’, 안전재고보다 적으면 ‘부족’으로 표시합니다. 원자재 재고
                  관리는 추후 지원합니다.
                </p>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

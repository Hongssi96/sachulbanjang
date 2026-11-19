import FilterSelect from '../../components/FilterSelect';
import LoadingState from '../../components/LoadingState';
import { useState, useTransition } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  FilterX,
  Info,
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
import StockDetail from './StockDetail';
import StockMovementForm from './StockMovementForm';
import {
  applyMovement,
  availableStock,
  formatStockDate,
  inventorySummary,
  loadInventory,
  persistInventory,
  productGroups,
  stockStatus,
} from './inventoryModel';
import type { InventoryState, StockMovement } from './inventoryModel';
import './InventoryPage.css';

type DialogState =
  | { kind: 'movement'; itemId?: string }
  | { kind: 'detail'; itemId: string }
  | { kind: 'history' }
  | { kind: 'help' }
  | null;
export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryState>(loadInventory);
  const [params, rawSetParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const setParams = (...args: Parameters<typeof rawSetParams>) =>
    startTransition(() => rawSetParams(...args));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [feedback, setFeedback] = useState('');
  const [historyKind, setHistoryKind] = useState('all');
  const query = params.get('q') ?? '';
  const product = productGroups.find((value) => value === params.get('product')) ?? '';
  const warehouse =
    ['A창고', 'B창고', 'C창고'].find((value) => value === params.get('warehouse')) ?? '';
  const onlyLow = params.get('status') === 'low';
  const order = params.get('sort');
  const summary = inventorySummary(inventory.items);
  const rows = inventory.items.filter(
    (item) =>
      (!product || item.product === product) &&
      (!warehouse || item.warehouse === warehouse) &&
      (!onlyLow || stockStatus(item) !== '정상') &&
      `${item.name} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  if (order === 'available-asc' || order === 'available-desc')
    rows.sort(
      (a, b) => (availableStock(a) - availableStock(b)) * (order === 'available-asc' ? 1 : -1),
    );
  const lowItems = inventory.items.filter((item) => stockStatus(item) !== '정상');
  const detailItem =
    dialog?.kind === 'detail'
      ? inventory.items.find((item) => item.id === dialog.itemId)
      : undefined;
  const recentMovements = inventory.movements.filter(
    (movement) => historyKind === 'all' || movement.kind === historyKind,
  );
  const groupedStock = productGroups.map((group) => ({
    group,
    ...inventorySummary(inventory.items.filter((item) => item.product === group)),
  }));
  const maxStock = Math.max(...groupedStock.map((group) => group.stock), 1);
  const setFilter = (key: string, value: string) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };
  const commitInventory = (next: InventoryState, message: string) => {
    setInventory(next);
    setFeedback(
      persistInventory(next)
        ? message
        : `${message} 브라우저 저장에 실패해 새로고침하면 변경이 사라집니다.`,
    );
  };
  const saveMovement = (movement: StockMovement) => {
    try {
      const next = applyMovement(inventory, movement);
      commitInventory(
        next,
        `${inventory.items.find((item) => item.id === movement.itemId)?.name} ${movement.quantity.toLocaleString()}개 ${movement.kind === 'in' ? '입고' : '출고'}를 기록했어요.`,
      );
      setDialog(null);
    } catch (error: unknown) {
      setFeedback(error instanceof Error ? error.message : '입출고 기록을 저장하지 못했어요.');
    }
  };
  const updateSafety = (itemId: string, safety: number) => {
    if (!Number.isSafeInteger(safety) || safety < 0 || safety > 9999999) return;
    commitInventory(
      {
        ...inventory,
        items: inventory.items.map((item) => (item.id === itemId ? { ...item, safety } : item)),
        updatedAt: new Date().toISOString(),
      },
      '안전재고 기준을 변경했어요.',
    );
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
        item.id,
        item.name,
        String(item.stock),
        String(item.reserved),
        String(availableStock(item)),
        String(item.safety),
        item.warehouse,
        item.bin,
        stockStatus(item),
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
    anchor.download = '사출반장_완제품재고_예시.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback(`조회 결과 ${rows.length}개 품목을 CSV로 내려받았어요.`);
  };
  const movementList = (movements: StockMovement[]) => (
    <div className="inv-movement-list">
      {movements.length ? (
        movements.map((movement) => (
          <div className="inv-movement-row" key={movement.id}>
            <span className={`inv-movement-icon ${movement.kind === 'in' ? 'in' : 'out'}`}>
              {movement.kind === 'in' ? (
                <ArrowDownToLine size={18} />
              ) : (
                <ArrowUpFromLine size={18} />
              )}
            </span>
            <div>
              <strong>
                {inventory.items.find((item) => item.id === movement.itemId)?.name}
                <span>{movement.kind === 'in' ? '입고' : '출고'}</span>
              </strong>
              <small>
                {formatStockDate(movement.date)} · {movement.author}
              </small>
            </div>
            <span className={`inv-movement-quantity ${movement.kind === 'in' ? 'in' : ''}`}>
              {movement.kind === 'in' ? '+' : '−'}
              {movement.quantity.toLocaleString()}
              <small>개</small>
            </span>
          </div>
        ))
      ) : (
        <p className="empty-text">해당하는 입출고 기록이 없어요.</p>
      )}
    </div>
  );
  return (
    <div className="inventory-page">
      {isPending && <LoadingState compact label="재고 데이터를 조회하는 중이에요" />}
      <section className="page-intro">
        <div>
          <div className="eyebrow">
            <span />
            INVENTORY AT A GLANCE
          </div>
          <h1 className="sr-only">
            재고 관리<span className="greeting-dot">.</span>
          </h1>
          <p>완제품의 입고부터 출고까지, 필요한 재고를 한눈에 확인하세요.</p>
        </div>
        <div className="inv-intro-actions">
          <button className="button button-white" onClick={download} disabled={!rows.length}>
            <Download size={18} />
            재고 다운로드
          </button>
          <button className="button button-primary" onClick={() => setDialog({ kind: 'movement' })}>
            <Plus size={18} />
            입출고 등록
          </button>
        </div>
      </section>
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
      <div className={`inv-stock-alert ${lowItems.length ? '' : 'inv-stock-safe'}`}>
        <span className="inv-alert-icon">
          {lowItems.length ? <TriangleAlert size={19} /> : <ShieldCheck size={19} />}
        </span>
        <p>
          {lowItems.length ? (
            <>
              <strong>{lowItems.map((item) => item.name).join(', ')}</strong>의 가용재고가 안전재고
              기준에 미달합니다.
            </>
          ) : (
            <strong>모든 품목의 가용재고가 안전재고 기준을 충족하고 있어요.</strong>
          )}
        </p>
        {lowItems.length > 0 && (
          <button
            onClick={() => {
              setParams({ status: 'low' });
              document
                .getElementById('inventory-table-heading')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            부족 재고 확인
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      <section aria-labelledby="inventory-summary-title">
        <div className="section-top">
          <h2 id="inventory-summary-title">
            전체 재고 요약{' '}
            <span className="live-label">
              <i />
              DEMO
            </span>
          </h2>
          <span className="muted">전체 완제품 {inventory.items.length}개 품목 기준</span>
        </div>
        <div className="kpi-grid">
          <article className="kpi">
            <div className="kpi-label">
              현재고
              <Boxes size={19} />
            </div>
            <div className="kpi-value">
              {summary.stock.toLocaleString()}
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>보관 중인 전체 완제품</span>
              <span className="positive">{inventory.items.length}개 품목</span>
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
              {summary.available.toLocaleString()}
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>현재고 − 출고 예약</span>
              <span className="positive">즉시 출고 가능</span>
            </div>
            <div className="mini-progress">
              <span
                style={{
                  width: `${summary.stock ? (summary.available / summary.stock) * 100 : 0}%`,
                }}
              />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              출고 예약
              <Truck size={19} />
            </div>
            <div className="kpi-value">
              {summary.reserved.toLocaleString()}
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>납품을 위해 확보한 수량</span>
              <span>예약 제외 후 출고</span>
            </div>
            <div className="mini-progress inv-reserved-progress">
              <span
                style={{
                  width: `${summary.stock ? (summary.reserved / summary.stock) * 100 : 0}%`,
                }}
              />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              부족·품절 품목
              <TriangleAlert size={19} />
            </div>
            <div className="kpi-value">
              {summary.low}
              <span>개 품목</span>
              <span className={`pill ${summary.low ? 'pill-amber' : 'pill-green'}`}>
                {summary.low ? '확인 필요' : '재고 정상'}
              </span>
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
            <span className="pill pill-neutral">{inventory.items.length}품목</span>
          </div>
          <button className="text-link" onClick={() => setDialog({ kind: 'help' })}>
            <CircleHelp size={16} />
            재고 기준 안내
          </button>
        </div>
        <div className="inv-category-bar">
          <div className="inv-category">
            <Package size={18} />
            완제품<span>{inventory.items.length}</span>
          </div>
          <span className="inv-category-future">
            원자재 <small>추후 지원</small>
          </span>
          <span className="inv-last-update">
            마지막 갱신 {formatStockDate(inventory.updatedAt)}
          </span>
        </div>
        <div className="inv-filter-bar">
          <label className="inv-search">
            <Search size={18} />
            <input
              aria-label="재고 품목 검색"
              placeholder="제품명 또는 품목 코드 검색"
              value={query}
              onChange={(event) => setFilter('q', event.target.value)}
            />
            {query && (
              <button aria-label="검색어 지우기" onClick={() => setFilter('q', '')}>
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
                ...productGroups.map((value) => ({ value, label: value })),
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
                ...['A창고', 'B창고', 'C창고'].map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <div className="inv-status-filters" aria-label="재고 상태 필터">
            <button
              className={!onlyLow ? 'selected' : ''}
              aria-pressed={!onlyLow}
              onClick={() => setFilter('status', '')}
            >
              전체
            </button>
            <button
              className={onlyLow ? 'selected' : ''}
              aria-pressed={onlyLow}
              onClick={() => setFilter('status', 'low')}
            >
              부족·품절 <span>{summary.low}</span>
            </button>
          </div>
        </div>
        <div
          className="inv-table-scroll"
          style={{ height: `${56 + inventory.items.length * 81}px` }}
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
                    onClick={() =>
                      setFilter(
                        'sort',
                        order === 'available-asc' ? 'available-desc' : 'available-asc',
                      )
                    }
                  >
                    가용재고
                    <ArrowDownUp size={14} />
                  </button>
                </th>
                <th scope="col" className="inv-number">
                  안전재고
                </th>
                <th scope="col">보관 위치</th>
                <th scope="col">상태</th>
                <th scope="col">
                  <span className="sr-only">상세</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="inv-product-cell"
                      onClick={() => setDialog({ kind: 'detail', itemId: item.id })}
                    >
                      <span
                        className={`inv-product-icon ${stockStatus(item) !== '정상' ? 'warning' : ''}`}
                      >
                        <Package size={18} />
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.id}</small>
                      </span>
                    </button>
                  </td>
                  <td className="inv-number">{item.stock.toLocaleString()}</td>
                  <td className="inv-number inv-muted-number">{item.reserved.toLocaleString()}</td>
                  <td
                    className={`inv-number inv-available ${stockStatus(item) !== '정상' ? 'warning' : ''}`}
                  >
                    {availableStock(item).toLocaleString()}
                  </td>
                  <td className="inv-number inv-muted-number">{item.safety.toLocaleString()}</td>
                  <td>
                    <span className="inv-warehouse">
                      <MapPin size={13} />
                      {item.warehouse}
                      <small>{item.bin}</small>
                    </span>
                  </td>
                  <td>
                    <span
                      className={`pill ${stockStatus(item) === '정상' ? 'pill-green' : 'pill-amber'}`}
                    >
                      {stockStatus(item) === '정상' ? (
                        <Check size={12} />
                      ) : (
                        <TriangleAlert size={12} />
                      )}
                      {stockStatus(item)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`${item.name} 재고 상세`}
                      onClick={() => setDialog({ kind: 'detail', itemId: item.id })}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="inv-empty">
              <PackageSearch size={36} />
              <h3>조건에 맞는 재고가 없어요</h3>
              <p>검색어나 조회 조건을 바꿔 다시 확인해 주세요.</p>
              <button className="button button-white" onClick={() => setParams({})}>
                <FilterX size={16} />
                필터 초기화
              </button>
            </div>
          )}
        </div>
        <div className="inv-table-footer">
          <span>
            전체 {inventory.items.length}개 중 <strong>{rows.length}개</strong> 품목
          </span>
          <span>수량 단위: 개 · 품목을 선택하면 상세 내역을 확인할 수 있어요.</span>
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
              <span className="pill pill-neutral">{inventory.movements.length}</span>
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
                onClick={() => setHistoryKind(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {movementList(recentMovements.slice(0, 5))}
        </section>
        <section className="card inv-product-summary">
          <div className="card-heading">
            <div>
              <h2>제품군별 재고</h2>
              <p>보관 중인 재고의 구성을 확인하세요.</p>
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
                aria-label={`${group.group} 재고 ${group.stock.toLocaleString()}개 조회`}
                aria-describedby={`stock-tooltip-${group.group}`}
              >
                <strong>{group.group}</strong>
                <span className="inv-bar-track">
                  <span
                    className="inv-bar-available"
                    style={{ width: `${(group.available / maxStock) * 100}%` }}
                  />
                  <span
                    className="inv-bar-reserved"
                    style={{ width: `${(group.reserved / maxStock) * 100}%` }}
                  />
                </span>
                <b>
                  {group.stock.toLocaleString()}
                  <small>개</small>
                </b>
                <span
                  className="inv-stock-tooltip"
                  id={`stock-tooltip-${group.group}`}
                  role="tooltip"
                >
                  <strong>{group.group} 재고 상세</strong>
                  <span>
                    현재고 <b>{group.stock.toLocaleString()}개</b>
                  </span>
                  <span>
                    출고 예약 <b>{group.reserved.toLocaleString()}개</b>
                  </span>
                  <span>
                    가용재고 <b>{group.available.toLocaleString()}개</b>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="inv-summary-note">
            <Info size={17} />
            <p>
              출고 예약은 가용재고에서 제외돼요.
              <br />
              <strong>실제로 출고할 수 있는 수량</strong>을 먼저 확인해 주세요.
            </p>
          </div>
        </section>
      </div>
      <footer className="page-footer inv-page-footer">
        <span>가용재고 = 현재고 − 출고 예약 · 부족 기준 = 가용재고 &lt; 안전재고</span>
        <span>예시 데이터 · 변경사항은 현재 브라우저에 저장</span>
      </footer>
      {dialog && (
        <Modal
          title={
            dialog.kind === 'movement'
              ? '완제품 입출고 등록'
              : dialog.kind === 'detail'
                ? '품목 재고 상세'
                : dialog.kind === 'history'
                  ? '입출고 이력'
                  : '재고 기준 안내'
          }
          onClose={() => setDialog(null)}
        >
          {dialog.kind === 'movement' && (
            <StockMovementForm
              items={inventory.items}
              initialItemId={dialog.itemId}
              onSave={saveMovement}
            />
          )}
          {dialog.kind === 'detail' && detailItem && (
            <StockDetail
              item={detailItem}
              movements={inventory.movements.filter(
                (movement) => movement.itemId === detailItem.id,
              )}
              onMove={() => setDialog({ kind: 'movement', itemId: detailItem.id })}
              onSafetyChange={(value) => updateSafety(detailItem.id, value)}
            />
          )}
          {dialog.kind === 'history' && (
            <>
              <p className="muted">최근 50건까지 표시합니다. 전체 {inventory.movements.length}건</p>
              {movementList(inventory.movements)}
            </>
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

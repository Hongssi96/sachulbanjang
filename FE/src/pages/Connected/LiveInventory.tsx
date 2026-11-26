import { usePageEntryReady } from '../../components/PageEntry/PageEntryContext';
import { formatNumber } from '../../utils/numberFormat';
import { formText } from '../../api/business';
import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import useRemote from '../../hooks/useRemote';
import { useAuth } from '../../hooks/useAuth';
import { date, list, number, query, text, write } from '../../api/business';
import type { Row } from '../../api/business';
import { Field, Metrics, MutationDialog, Pager, RemoteState, Select, Table } from './LiveShared';
import Modal from '../../components/Modal';

export default function LiveInventory() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [low, setLow] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [action, setAction] = useState<'movement' | 'minimum' | null>(null);
  const resource = useRemote(
    useCallback(
      () =>
        list(
          query('/stocks', { page, page_size: 10, q: search, low_stock: low ? 'true' : undefined }),
        ),
      [page, search, low],
    ),
  );
  usePageEntryReady(!resource.loading);
  const movements = useRemote(
    useCallback(
      () =>
        selected
          ? list(
              query('/stock-movements', {
                product_id: number(selected.product_id),
                page_size: 100,
              }),
            )
          : Promise.resolve({ items: [], total: 0, pages: 0 }),
      [selected],
    ),
  );
  return (
    <div className="live-page">
      <h1>재고 관리</h1>
      <div className="live-filters">
        <label>
          품목 검색
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="live-tabs">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              aria-pressed={low === value}
              onClick={() => {
                setLow(value);
                setPage(1);
              }}
            >
              {value ? '부족 재고' : '전체'}
            </button>
          ))}
        </div>
        <button
          className="button button-white live-refresh-button"
          type="button"
          aria-label="새로고침"
          title="새로고침"
          onClick={resource.reload}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <RemoteState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <Metrics
            values={[
              ['조회 품목', `${resource.data.total}종`],
              [
                '현재 페이지 재고 합계',
                formatNumber(
                  resource.data.items.reduce((sum, row) => sum + number(row.quantity), 0),
                ),
              ],
            ]}
          />
          <section className="live-card">
            <Table
              rows={resource.data.items}
              columns={[
                ['product_code', '제품 코드'],
                ['name', '품목'],
                ['quantity', '현재고'],
                ['minimum_stock', '안전 재고'],
                [
                  'is_low_stock',
                  '상태',
                  (row) => (
                    <span className={`live-badge ${row.is_low_stock ? 'bad' : ''}`}>
                      {row.is_low_stock ? '안전 재고 미달' : '정상'}
                    </span>
                  ),
                ],
              ]}
              action={(row) => (
                <button className="button button-white" onClick={() => setSelected(row)}>
                  재고 상세
                </button>
              )}
            />
          </section>
          <Pager data={resource.data} page={page} setPage={setPage} />
        </>
      )}
      {selected && !action && (
        <Modal title={`${text(selected.name)} 재고 상세`} wide onClose={() => setSelected(null)}>
          <div className="live-form">
            <p>
              현재고 {text(selected.quantity)} · 안전 재고 {text(selected.minimum_stock)}
            </p>
            <div className="live-toolbar">
              <button className="button button-primary" onClick={() => setAction('movement')}>
                입고·출고·재고 조정
              </button>
              {user?.role === 'admin' && (
                <button className="button button-white" onClick={() => setAction('minimum')}>
                  안전 재고 변경
                </button>
              )}
            </div>
            <RemoteState {...movements} retry={movements.reload} />
            {movements.data && (
              <>
                <p className="live-muted">최근 원장 최대 100건 · 전체 {movements.data.total}건</p>
                <Table
                  rows={movements.data.items}
                  columns={[
                    ['kind', '구분'],
                    ['delta', '증감'],
                    ['reason', '사유'],
                    ['actor_display_name', '담당자'],
                    ['created_at', '일시', (row) => date(row.created_at)],
                  ]}
                />
              </>
            )}
          </div>
        </Modal>
      )}
      {selected && action && (
        <MutationDialog
          title={action === 'minimum' ? '안전 재고 변경' : '재고 입출고'}
          close={() => {
            setAction(null);
            setSelected(null);
            resource.reload();
          }}
          submit={async (form) => {
            const amount = Number(formText(form, 'quantity'));
            if (!Number.isSafeInteger(amount) || amount < 0)
              throw new Error('수량은 0 이상의 정수로 입력해 주세요.');
            if (action === 'minimum')
              await write(`/products/${number(selected.product_id)}/minimum-stock`, 'PATCH', {
                minimum_stock: amount,
              });
            else
              await write('/stock-movements', 'POST', {
                product_id: selected.product_id,
                kind: formText(form, 'kind'),
                quantity: amount,
                reason: formText(form, 'reason') || null,
              });
          }}
        >
          {action === 'movement' && (
            <Select
              name="kind"
              label="구분"
              options={[
                ['receipt', '입고'],
                ['issue', '출고'],
                ['adjustment', '실재고로 조정'],
                ...(user?.role === 'admin' ? [['initial', '초기 재고'] as [string, string]] : []),
              ]}
            />
          )}
          <Field
            name="quantity"
            label={action === 'minimum' ? '안전 재고 수량' : '수량 (조정 시 실제 재고 수량)'}
            type="number"
            value={action === 'minimum' ? number(selected.minimum_stock ?? 0) : undefined}
          />
          {action === 'movement' && <Field name="reason" label="사유 (재고 조정 시 필수)" />}
        </MutationDialog>
      )}
    </div>
  );
}

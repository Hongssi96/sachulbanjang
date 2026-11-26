import { formatNumber } from '../../utils/numberFormat';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, MapPin, Package } from 'lucide-react';
import type { MovementItem, StockItem } from '../../api/inventory';
import ApiErrorState from '../../components/ApiErrorState';
import LoadingState from '../../components/LoadingState';
import {
  formatStockDate,
  movementAmount,
  movementKindLabel,
  movementSymbol,
  NOT_AVAILABLE,
  stockStatus,
} from './inventoryModel';
interface Props {
  item: StockItem;
  movements: MovementItem[];
  movementsLoading: boolean;
  movementsError: Error | null;
  onRetryMovements: () => void;
  onMove: () => void;
  onSafetyChange: (value: number) => Promise<void>;
}
export default function StockDetail({
  item,
  movements,
  movementsLoading,
  movementsError,
  onRetryMovements,
  onMove,
  onSafetyChange,
}: Props) {
  const [safety, setSafety] = useState(
    item.minimum_stock === null ? '' : String(item.minimum_stock),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    setSafety(item.minimum_stock === null ? '' : String(item.minimum_stock));
  }, [item.minimum_stock]);
  const valid =
    safety.trim() !== '' &&
    Number.isSafeInteger(Number(safety)) &&
    Number(safety) >= 0 &&
    Number(safety) <= 9999999;
  return (
    <div className="inv-detail">
      <div className="inv-detail-title">
        <span className="inv-product-icon">
          <Package size={26} />
        </span>
        <div>
          <h3>{item.name}</h3>
          <p>{item.product_code ?? NOT_AVAILABLE} · 사이드 몰딩 완제품</p>
        </div>
        <span className={`pill ${item.is_low_stock ? 'pill-amber' : 'pill-green'}`}>
          {stockStatus(item.is_low_stock)}
        </span>
      </div>
      <div className="inv-detail-quantities">
        <div>
          <span>현재고</span>
          <strong>
            {formatNumber(item.quantity)}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>출고 예약</span>
          <strong>{NOT_AVAILABLE}</strong>
        </div>
        <div>
          <span>가용재고</span>
          <strong>{NOT_AVAILABLE}</strong>
        </div>
      </div>
      <p className="inv-location">
        <MapPin size={16} />
        {NOT_AVAILABLE} · {NOT_AVAILABLE}
      </p>
      <dl className="inv-detail-balance-time">
        <dt>잔고 수정 시각 (한국시간)</dt>
        <dd>{formatStockDate(item.balance_updated_at)}</dd>
      </dl>
      <form
        className="inv-safety-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid || saving) return;
          setSaving(true);
          setSaveError('');
          try {
            await onSafetyChange(Number(safety));
          } catch (caught) {
            setSaveError(
              caught instanceof Error ? caught.message : '안전재고 기준을 변경하지 못했어요.',
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <label htmlFor="safety-stock">
          안전재고 <small>가용재고가 이 수량보다 적으면 ‘부족’으로 표시해요.</small>
        </label>
        <div>
          <input
            id="safety-stock"
            type="number"
            min="0"
            max="9999999"
            step="1"
            required
            value={safety}
            placeholder="미설정"
            onChange={(event) => setSafety(event.target.value)}
          />
          <span>개</span>
          <button
            className="button button-white"
            type="submit"
            disabled={!valid || saving || Number(safety) === item.minimum_stock}
          >
            <Check size={16} />
            {saving ? '저장 중' : '적용'}
          </button>
        </div>
        {saveError && (
          <p className="inv-form-error" role="alert">
            {saveError}
          </p>
        )}
      </form>
      <h4>최근 입출고</h4>
      <div className="inv-detail-history">
        {movementsError ? (
          <ApiErrorState error={movementsError} compact onRetry={onRetryMovements} />
        ) : movementsLoading ? (
          <LoadingState compact label="입출고 기록을 불러오는 중이에요" />
        ) : movements.length ? (
          movements.slice(0, 5).map((movement) => (
            <div key={movement.movement_id}>
              <span className={`pill ${movement.delta >= 0 ? 'pill-green' : 'pill-violet'}`}>
                {movementKindLabel(movement.kind)}
              </span>
              <span>
                {formatStockDate(movement.created_at)}
                <small>
                  {movement.reason ?? '사유 없음'}
                  {movement.checked_at ? ' · 확인 완료' : ''}
                </small>
              </span>
              <strong>
                {movementSymbol(movement.delta)}
                {movementAmount(movement.delta)}개
              </strong>
            </div>
          ))
        ) : (
          <p className="empty-text">아직 입출고 기록이 없어요.</p>
        )}
      </div>
      <button className="button button-primary inv-submit" onClick={onMove}>
        이 품목 입출고 등록
        <ArrowUpRight size={17} />
      </button>
    </div>
  );
}

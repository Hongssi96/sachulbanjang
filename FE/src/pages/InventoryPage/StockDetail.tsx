import { useState } from 'react';
import { ArrowUpRight, Check, MapPin, Package } from 'lucide-react';
import { availableStock, stockStatus } from './inventoryModel';
import type { StockItem, StockMovement } from './inventoryModel';
import { formatStockDate } from './inventoryModel';
interface Props {
  item: StockItem;
  movements: StockMovement[];
  onMove: () => void;
  onSafetyChange: (value: number) => void;
}
export default function StockDetail({ item, movements, onMove, onSafetyChange }: Props) {
  const [safety, setSafety] = useState(String(item.safety));
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
          <p>{item.id} · 사이드 몰딩 완제품</p>
        </div>
        <span className={`pill ${stockStatus(item) === '정상' ? 'pill-green' : 'pill-amber'}`}>
          {stockStatus(item)}
        </span>
      </div>
      <div className="inv-detail-quantities">
        <div>
          <span>현재고</span>
          <strong>
            {item.stock.toLocaleString()}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>출고 예약</span>
          <strong>
            {item.reserved.toLocaleString()}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>가용재고</span>
          <strong>
            {availableStock(item).toLocaleString()}
            <small>개</small>
          </strong>
        </div>
      </div>
      <p className="inv-location">
        <MapPin size={16} />
        {item.warehouse} · {item.bin}
      </p>
      <form
        className="inv-safety-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSafetyChange(Number(safety));
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
            onChange={(event) => setSafety(event.target.value)}
          />
          <span>개</span>
          <button
            className="button button-white"
            type="submit"
            disabled={!valid || Number(safety) === item.safety}
          >
            <Check size={16} />
            적용
          </button>
        </div>
      </form>
      <h4>최근 입출고</h4>
      <div className="inv-detail-history">
        {movements.length ? (
          movements.slice(0, 5).map((movement) => (
            <div key={movement.id}>
              <span className={`pill ${movement.kind === 'in' ? 'pill-green' : 'pill-violet'}`}>
                {movement.kind === 'in' ? '입고' : '출고'}
              </span>
              <span>
                {formatStockDate(movement.date)}
                <small>{movement.note}</small>
              </span>
              <strong>
                {movement.kind === 'in' ? '+' : '−'}
                {movement.quantity.toLocaleString()}개
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

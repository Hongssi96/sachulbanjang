import FilterSelect from '../../components/FilterSelect';
import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Info, Save } from 'lucide-react';
import { availableStock, movementError } from './inventoryModel';
import type { StockItem, StockMovement } from './inventoryModel';

interface Props {
  items: StockItem[];
  initialItemId?: string;
  onSave: (movement: StockMovement) => void;
}
export default function StockMovementForm({ items, initialItemId, onSave }: Props) {
  const [itemId, setItemId] = useState(initialItemId ?? items[0].id);
  const [kind, setKind] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const item = items.find((value) => value.id === itemId);
  const amount = Number(quantity);
  const error = movementError(item, kind, amount);
  return (
    <form
      className="inv-movement-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (error) return;
        onSave({
          id: crypto.randomUUID(),
          itemId,
          kind,
          quantity: amount,
          date: new Date().toISOString(),
          note: note.trim() || (kind === 'in' ? '완제품 입고' : '완제품 출고'),
          author: '박민규',
        });
      }}
    >
      <div className="inv-form-info">
        <Info size={18} />
        <span>재고 수량을 변경합니다.</span>
      </div>
      <fieldset className="inv-kind-options">
        <legend>처리 유형</legend>
        <label className={kind === 'in' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="movement-kind"
            checked={kind === 'in'}
            onChange={() => setKind('in')}
          />
          <ArrowDownToLine size={18} />
          입고
        </label>
        <label className={kind === 'out' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="movement-kind"
            checked={kind === 'out'}
            onChange={() => setKind('out')}
          />
          <ArrowUpFromLine size={18} />
          출고
        </label>
      </fieldset>
      <label className="inv-field" htmlFor="movement-item">
        품목
        <FilterSelect
          id="movement-item"
          label="입출고 품목 선택"
          value={itemId}
          onChange={setItemId}
          options={items.map((item) => ({ value: item.id, label: `${item.name} · ${item.id}` }))}
        />
      </label>
      {item && (
        <div className="inv-form-stock">
          <span>
            현재고 <b>{item.stock.toLocaleString()}개</b>
          </span>
          <span>
            출고 가능 <b>{availableStock(item).toLocaleString()}개</b>
          </span>
        </div>
      )}
      <label className="inv-field" htmlFor="movement-quantity">
        수량 <span className="muted">단위: 개</span>
        <input
          id="movement-quantity"
          type="number"
          min="1"
          max="999999"
          step="1"
          required
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="수량을 입력하세요"
          aria-describedby={quantity && error ? 'movement-error' : undefined}
          aria-invalid={!!quantity && !!error}
        />
      </label>
      {quantity && error && (
        <p id="movement-error" className="inv-form-error" role="alert">
          {error}
        </p>
      )}
      <label className="inv-field" htmlFor="movement-note">
        메모 <span className="muted">선택</span>
        <textarea
          id="movement-note"
          rows={2}
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="입출고 사유를 남겨 주세요."
        />
      </label>
      {!error && item && (
        <div className="inv-form-preview">
          <span>처리 후 현재고</span>
          <strong>
            {(item.stock + (kind === 'in' ? amount : -amount)).toLocaleString()}
            <small>개</small>
          </strong>
        </div>
      )}
      <button className="button button-primary inv-submit" type="submit" disabled={!!error}>
        <Save size={18} />
        {kind === 'in' ? '입고' : '출고'} 기록 저장
      </button>
    </form>
  );
}

import FilterSelect from '../../components/FilterSelect';
import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  PackagePlus,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import type { CreatableMovementKind, MovementItem, StockItem } from '../../api/inventory';
import {
  formatStockDate,
  movementAmount,
  movementKindLabel,
  movementSymbol,
  NOT_AVAILABLE,
} from './inventoryModel';

export interface MovementFormValues {
  productId: number;
  kind: CreatableMovementKind;
  quantity: number;
  reason?: string;
}

function movementError(
  item: StockItem | undefined,
  kind: CreatableMovementKind,
  quantity: number,
  reason: string,
): string {
  if (!item) return '품목을 선택해 주세요.';
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 999999)
    return kind === 'adjustment'
      ? '조정 후 현재고는 0~999,999 사이의 정수로 입력해 주세요.'
      : '수량은 1~999,999 사이의 정수로 입력해 주세요.';
  if (kind !== 'adjustment' && quantity <= 0) {
    return '수량은 1~999,999 사이의 정수로 입력해 주세요.';
  }
  if (kind === 'issue' && quantity > item.quantity)
    return `출고 가능한 수량은 ${item.quantity.toLocaleString()}개입니다.`;
  if (kind === 'initial' && item.quantity > 0)
    return '이미 재고가 있는 품목에는 초기 재고를 등록할 수 없습니다.';
  if (kind === 'adjustment') {
    if (quantity === item.quantity) return '현재고와 다른 수량을 입력해 주세요.';
    if (!reason.trim()) return '조정 사유를 입력해 주세요.';
  }
  return '';
}

interface Props {
  items: StockItem[];
  initialItemId?: number;
  isAdmin: boolean;
  onSave: (values: MovementFormValues) => Promise<void>;
}
export default function StockMovementForm({ items, initialItemId, isAdmin, onSave }: Props) {
  const [itemId, setItemId] = useState<number | undefined>(initialItemId);
  const [kind, setKind] = useState<CreatableMovementKind>('receipt');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedId = itemId ?? items[0]?.product_id;
  const item = items.find((value) => value.product_id === selectedId);
  const amount = Number(quantity);
  const error = movementError(item, kind, amount, note);
  const preview =
    kind === 'adjustment' ? amount : (item?.quantity ?? 0) + (kind === 'issue' ? -amount : amount);

  if (!items.length) {
    return (
      <form className="inv-movement-form" onSubmit={(event) => event.preventDefault()}>
        <div className="inv-form-info">
          <Info size={18} />
          <span>재고 수량을 변경합니다.</span>
        </div>
        <p className="empty-text">
          등록할 수 있는 품목이 없어요. 품목이 등록된 뒤 다시 시도해 주세요.
        </p>
        <button className="button button-primary inv-submit" type="submit" disabled>
          <Save size={18} />
          기록 저장
        </button>
      </form>
    );
  }

  return (
    <form
      className="inv-movement-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (error || !item || saving) return;
        setSaving(true);
        setServerError('');
        try {
          await onSave({
            productId: item.product_id,
            kind,
            quantity: amount,
            reason: note.trim() || undefined,
          });
        } catch (caught) {
          setServerError(
            caught instanceof Error ? caught.message : '입출고 기록을 저장하지 못했어요.',
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="inv-form-info">
        <Info size={18} />
        <span>
          재고 수량을 변경합니다.
          {kind === 'adjustment' && ' 조정은 입력한 수량이 조정 후 현재고가 됩니다.'}
        </span>
      </div>
      <fieldset className="inv-kind-options">
        <legend>처리 유형</legend>
        <label className={kind === 'receipt' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="movement-kind"
            checked={kind === 'receipt'}
            onChange={() => setKind('receipt')}
          />
          <ArrowDownToLine size={18} />
          입고
        </label>
        <label className={kind === 'issue' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="movement-kind"
            checked={kind === 'issue'}
            onChange={() => setKind('issue')}
          />
          <ArrowUpFromLine size={18} />
          출고
        </label>
        <label className={kind === 'adjustment' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="movement-kind"
            checked={kind === 'adjustment'}
            onChange={() => setKind('adjustment')}
          />
          <SlidersHorizontal size={18} />
          조정
        </label>
        {isAdmin && (
          <label className={kind === 'initial' ? 'is-selected' : ''}>
            <input
              type="radio"
              name="movement-kind"
              checked={kind === 'initial'}
              onChange={() => setKind('initial')}
            />
            <PackagePlus size={18} />
            초기
          </label>
        )}
      </fieldset>
      <label className="inv-field" htmlFor="movement-item">
        품목
        <FilterSelect
          id="movement-item"
          label="입출고 품목 선택"
          value={String(selectedId ?? '')}
          onChange={(value) => setItemId(Number(value))}
          options={items.map((option) => ({
            value: String(option.product_id),
            label: `${option.name} · ${option.product_code ?? NOT_AVAILABLE}`,
          }))}
        />
      </label>
      {item && (
        <div className="inv-form-stock">
          <span>
            현재고 <b>{item.quantity.toLocaleString()}개</b>
          </span>
          <span>
            출고 가능 <b>{NOT_AVAILABLE}</b>
          </span>
        </div>
      )}
      <label className="inv-field" htmlFor="movement-quantity">
        {kind === 'adjustment' ? '조정 후 현재고' : '수량'} <span className="muted">단위: 개</span>
        <input
          id="movement-quantity"
          type="number"
          min={kind === 'adjustment' ? 0 : 1}
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
        메모 <span className="muted">{kind === 'adjustment' ? '필수' : '선택'}</span>
        <textarea
          id="movement-note"
          rows={2}
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            kind === 'adjustment' ? '조정 사유를 입력해 주세요.' : '입출고 사유를 남겨 주세요.'
          }
        />
      </label>
      {!error && item && (
        <div className="inv-form-preview">
          <span>처리 후 현재고</span>
          <strong>
            {preview.toLocaleString()}
            <small>개</small>
          </strong>
        </div>
      )}
      {serverError && (
        <p className="inv-form-error" role="alert">
          {serverError}
        </p>
      )}
      <button
        className="button button-primary inv-submit"
        type="submit"
        disabled={!!error || saving}
      >
        <Save size={18} />
        {saving ? '저장 중' : `${movementKindLabel(kind)} 기록 저장`}
      </button>
    </form>
  );
}

interface CorrectionProps {
  movement: MovementItem;
  onSave: (delta: number, reason: string) => Promise<void>;
}
export function StockCorrectionForm({ movement, onSave }: CorrectionProps) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const amount = Number(delta);
  const error =
    delta.trim() === ''
      ? '정정 수량을 입력해 주세요.'
      : !Number.isSafeInteger(amount) || amount === 0
        ? '정정 수량은 0이 아닌 정수로 입력해 주세요.'
        : !reason.trim()
          ? '정정 사유를 입력해 주세요.'
          : '';
  return (
    <form
      className="inv-movement-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (error || saving) return;
        setSaving(true);
        setServerError('');
        try {
          await onSave(amount, reason.trim());
        } catch (caught) {
          setServerError(
            caught instanceof Error ? caught.message : '정정 기록을 저장하지 못했어요.',
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="inv-form-info">
        <Info size={18} />
        <span>
          {movement.product_name} · {movementKindLabel(movement.kind)}{' '}
          {movementSymbol(movement.delta)}
          {movementAmount(movement.delta)}개 기록을 정정합니다.
        </span>
      </div>
      <p className="muted">
        {formatStockDate(movement.created_at)} · {movement.actor_display_name}
        {movement.reason ? ` · ${movement.reason}` : ''}
      </p>
      <label className="inv-field" htmlFor="correction-delta">
        정정 수량 <span className="muted">단위: 개</span>
        <input
          id="correction-delta"
          type="number"
          step="1"
          required
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
          placeholder="증가는 양수, 감소는 음수로 입력하세요"
          aria-invalid={delta.trim() !== '' && !!error}
        />
      </label>
      <label className="inv-field" htmlFor="correction-reason">
        정정 사유 <span className="muted">필수</span>
        <textarea
          id="correction-reason"
          rows={2}
          maxLength={200}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="정정 사유를 입력해 주세요."
        />
      </label>
      {serverError && (
        <p className="inv-form-error" role="alert">
          {serverError}
        </p>
      )}
      <button
        className="button button-primary inv-submit"
        type="submit"
        disabled={!!error || saving}
      >
        <Save size={18} />
        {saving ? '저장 중' : '정정 기록 저장'}
      </button>
    </form>
  );
}

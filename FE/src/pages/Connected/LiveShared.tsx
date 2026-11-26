import { useState } from 'react';
import type { ReactNode } from 'react';
import Modal from '../../components/Modal';
import LoadingState from '../../components/LoadingState';
import { errorMessage, text } from '../../api/business';
import type { Row, Page } from '../../api/business';
import { formatNumber } from '../../utils/numberFormat';
import './Connected.css';

export function RemoteState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return loading ? (
    <LoadingState label="서버에서 데이터를 조회하고 있어요" />
  ) : error ? (
    <div className="live-error" role="alert">
      {error}{' '}
      <button className="button button-white" onClick={retry}>
        다시 조회
      </button>
    </div>
  ) : null;
}
export function Pager({
  data,
  page,
  setPage,
}: {
  data: Page;
  page: number;
  setPage: (value: number) => void;
}) {
  return (
    <div className="live-pager">
      <button
        className="button button-white"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        이전
      </button>
      <span>
        {page} / {Math.max(1, data.pages)} · 전체 {data.total}건
      </span>
      <button
        className="button button-white"
        disabled={page >= data.pages}
        onClick={() => setPage(page + 1)}
      >
        다음
      </button>
    </div>
  );
}
export function Table({
  rows,
  columns,
  action,
}: {
  rows: Row[];
  columns: [string, string, ((row: Row) => ReactNode)?][];
  action?: (row: Row) => ReactNode;
}) {
  return rows.length ? (
    <div className="live-table-wrap">
      <table className="live-table">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
            {action && <th scope="col">상세</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map(([key, , render]) => (
                <td key={key}>
                  {render
                    ? render(row)
                    : typeof row[key] === 'number' && !Number.isInteger(row[key])
                      ? formatNumber(row[key])
                      : text(row[key])}
                </td>
              ))}
              {action && <td>{action(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="live-empty">조회된 데이터가 없습니다.</div>
  );
}
export function Metrics({ values }: { values: [string, ReactNode][] }) {
  return (
    <div className="live-grid">
      {values.map(([label, value]) => (
        <div className="live-card live-metric" key={label}>
          <small>{label}</small>
          <strong>{typeof value === 'number' ? formatNumber(value) : value}</strong>
        </div>
      ))}
    </div>
  );
}
export function MutationDialog({
  title,
  children,
  submit,
  close,
  label = '저장',
}: {
  title: string;
  children: ReactNode;
  submit: (form: FormData) => Promise<unknown>;
  close: () => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form
        className="live-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError('');
          try {
            await submit(form);
            close();
          } catch (reason) {
            setError(errorMessage(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0 }}
          className="live-form"
        >
          {children}
        </fieldset>
        {error && (
          <p className="live-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" disabled={busy}>
          {busy ? '저장 중…' : label}
        </button>
      </form>
    </Modal>
  );
}
export function Field({
  name,
  label,
  type = 'text',
  value,
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        defaultValue={value}
        required={required}
      />
    </label>
  );
}
export function Select({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: [string, string][];
  value?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {options.map(([key, title]) => (
          <option key={key} value={key}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

import { Fragment } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { MarkdownTable } from './reportTableMarkdown';

interface ReportTableEditorProps {
  table: MarkdownTable;
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (next: MarkdownTable) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

export default function ReportTableEditor({
  table,
  label,
  canMoveUp,
  canMoveDown,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ReportTableEditorProps) {
  const edit = (change: (next: MarkdownTable) => void) => {
    const next: MarkdownTable = {
      ...table,
      headers: [...table.headers],
      rows: table.rows.map((row) => [...row]),
      alignments: [...table.alignments],
    };
    change(next);
    onChange(next);
  };
  const setCell = (rowIndex: number, columnIndex: number, value: string) => {
    // 표 구분자와 겹치지 않도록 셀 안의 파이프 문자는 받지 않는다.
    const cell = value.replaceAll('|', '');
    edit((next) => {
      if (rowIndex < 0) next.headers[columnIndex] = cell;
      else next.rows[rowIndex][columnIndex] = cell;
    });
  };
  const addRow = () =>
    edit((next) => {
      next.rows.push(next.headers.map(() => ''));
    });
  const removeRow = (rowIndex: number) =>
    edit((next) => {
      next.rows.splice(rowIndex, 1);
    });
  const addColumn = () =>
    edit((next) => {
      next.headers.push('');
      next.alignments.push('default');
      next.rows.forEach((row) => row.push(''));
    });
  const removeColumn = (columnIndex: number) => {
    if (table.headers.length <= 1) return;
    edit((next) => {
      next.headers.splice(columnIndex, 1);
      next.alignments.splice(columnIndex, 1);
      next.rows.forEach((row) => row.splice(columnIndex, 1));
    });
  };

  return (
    <div className="rpd-table-block">
      <div className="rpd-table-block-head">
        <strong className="rpd-table-label">{label}</strong>
        <div className="rpd-table-block-tools">
          <button
            type="button"
            className="rpd-table-move"
            aria-label={`${label} 위로 이동`}
            title="위로 이동"
            disabled={!canMoveUp}
            onClick={onMoveUp}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="rpd-table-move"
            aria-label={`${label} 아래로 이동`}
            title="아래로 이동"
            disabled={!canMoveDown}
            onClick={onMoveDown}
          >
            <ArrowDown size={14} />
          </button>
          <button type="button" className="rpd-table-delete" onClick={onRemove}>
            <Trash2 size={13} /> 표 삭제
          </button>
        </div>
      </div>
      <div className="rpd-table-grid-wrap">
        <div
          className="rpd-table-grid"
          style={{
            gridTemplateColumns: `repeat(${table.headers.length}, minmax(120px, 1fr)) 32px`,
          }}
        >
          {table.headers.map((header, columnIndex) => (
            <div className="rpd-table-head-cell" key={`h-${columnIndex}`}>
              <input
                aria-label={`${label} 머리글 ${columnIndex + 1}`}
                value={header}
                onChange={(event) => setCell(-1, columnIndex, event.target.value)}
              />
              <button
                type="button"
                className="rpd-table-remove"
                aria-label={`${label} ${columnIndex + 1}번째 열 삭제`}
                title="열 삭제"
                disabled={table.headers.length <= 1}
                onClick={() => removeColumn(columnIndex)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <span aria-hidden="true" />
          {table.rows.map((row, rowIndex) => (
            <Fragment key={`r-${rowIndex}`}>
              {row.map((cell, columnIndex) => (
                <input
                  key={`c-${columnIndex}`}
                  className="rpd-table-cell-input"
                  aria-label={`${label} ${rowIndex + 1}행 ${columnIndex + 1}열`}
                  value={cell}
                  onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                />
              ))}
              <button
                type="button"
                className="rpd-table-remove"
                aria-label={`${label} ${rowIndex + 1}행 삭제`}
                title="행 삭제"
                onClick={() => removeRow(rowIndex)}
              >
                <X size={14} />
              </button>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="rpd-table-block-actions">
        <button type="button" className="button button-white button-sm" onClick={addRow}>
          <Plus size={14} /> 행 추가
        </button>
        <button type="button" className="button button-white button-sm" onClick={addColumn}>
          <Plus size={14} /> 열 추가
        </button>
      </div>
    </div>
  );
}

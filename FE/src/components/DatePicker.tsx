import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '../utils/dateFormat';
import './DatePicker.css';
interface DatePickerProps {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  'aria-label': string;
}
function isDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}
export default function DatePicker({ value, onChange, 'aria-label': label }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    isDate(value) ? value.slice(0, 7) : new Date().toISOString().slice(0, 7),
  );
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const [year, monthNumber] = month.split('-').map(Number);
  const count = new Date(year, monthNumber, 0).getDate();
  const offset = new Date(year, monthNumber - 1, 1).getDay();
  function move(direction: number) {
    const next = new Date(year, monthNumber - 1 + direction, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }
  return (
    <div
      className="date-picker"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="date-picker-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open && isDate(value)) setMonth(value.slice(0, 7));
          setOpen(!open);
        }}
      >
        <span>{formatDate(value)}</span>
        <CalendarDays size={17} />
      </button>
      {open && (
        <div className="date-picker-popover" role="dialog" aria-label={`${label} 달력`}>
          <div className="date-picker-month">
            <button type="button" aria-label="이전 달" onClick={() => move(-1)}>
              <ChevronLeft size={17} />
            </button>
            <strong>
              {year}.{String(monthNumber).padStart(2, '0')}
            </strong>
            <button type="button" aria-label="다음 달" onClick={() => move(1)}>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="date-picker-grid">
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <span key={day} className="date-picker-weekday">
                {day}
              </span>
            ))}
            {Array.from({ length: offset }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: count }, (_, index) => {
              const day = index + 1;
              const iso = `${month}-${String(day).padStart(2, '0')}`;
              return (
                <button
                  key={day}
                  type="button"
                  className={value === iso ? 'selected' : ''}
                  aria-label={formatDate(iso)}
                  aria-pressed={value === iso}
                  onClick={() => {
                    onChange({ target: { value: iso } });
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="date-picker-footer">YYYY.MM.DD · 날짜를 선택하세요</div>
        </div>
      )}
    </div>
  );
}

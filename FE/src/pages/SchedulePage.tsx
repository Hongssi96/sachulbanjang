import { formatDate } from '../utils/dateFormat';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import FilterSelect from '../components/FilterSelect';
import { calendarEvents } from '../constants/demoData';
import type { CalendarEvent } from '../types';

interface SchedulePageProps {
  onToast: (message: string) => void;
}

const kindPill: Record<CalendarEvent['kind'], string> = {
  점검: 'pill-amber',
  납품: 'pill-green',
  회의: 'pill-violet',
};
const kindDot: Record<CalendarEvent['kind'], string> = {
  점검: 'sc-dot-amber',
  납품: 'sc-dot-green',
  회의: 'sc-dot-violet',
};
const kindOptions: CalendarEvent['kind'][] = ['점검', '납품', '회의'];
const kindSelectOptions = kindOptions.map((kind) => ({ value: kind, label: kind }));
const timePad = (value: number) => String(value).padStart(2, '0');
// 일정 시간은 시·분을 따로 고르고, 분은 5분 단위로 고른다.
const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  value: timePad(hour),
  label: timePad(hour),
}));
const minuteOptions = Array.from({ length: 12 }, (_, index) => {
  const value = timePad(index * 5);
  return { value, label: value };
});
const DEFAULT_HOUR = '09';
const DEFAULT_MINUTE = '00';
const filterOptions: Array<CalendarEvent['kind'] | '전체'> = ['전체', ...kindOptions];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function SchedulePage({ onToast }: SchedulePageProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [filter, setFilter] = useState('전체');
  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newHour, setNewHour] = useState(DEFAULT_HOUR);
  const [newMinute, setNewMinute] = useState(DEFAULT_MINUTE);
  const [newKind, setNewKind] = useState<CalendarEvent['kind']>('점검');

  const allEvents = [...calendarEvents, ...customEvents];
  const monthEvents = allEvents.filter((event) => (event.month ?? 10) === month && year === 2026);
  const dayEvents = (day: number) =>
    monthEvents.filter(
      (event) => event.day === day && (filter === '전체' || event.kind === filter),
    );
  const dayEventList = (day: number) =>
    dayEvents(day)
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time));
  const selectedEvents = dayEventList(selectedDay);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const prevMonthDays = new Date(year, month, 0).getDate();
  // 말일이 속한 주까지만 렌더링해 다음 달 한 줄이 통째로 보이지 않게 한다
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const changeMonth = (delta: number) => {
    let nextYear = year;
    let nextMonth = month + delta;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setYear(nextYear);
    setMonth(nextMonth);
    const maxDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    if (selectedDay > maxDay) setSelectedDay(maxDay);
  };

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      onToast('일정 제목을 입력해 주세요.');
      return;
    }
    setCustomEvents((prev) => [
      ...prev,
      {
        day: selectedDay,
        time: `${newHour}:${newMinute}`,
        title,
        kind: newKind,
        month,
        description: '이 브라우저 세션에 추가한 예시 일정이에요.',
      },
    ]);
    onToast(`${month + 1}월 ${selectedDay}일에 일정을 추가했어요. 새로고침하면 사라져요.`);
    setNewTitle('');
    setNewHour(DEFAULT_HOUR);
    setNewMinute(DEFAULT_MINUTE);
    setShowForm(false);
  };

  return (
    <>
      <section className="rt-filters" aria-label="일정 종류 필터">
        <div className="segmented-control" role="group">
          {filterOptions.map((kind) => (
            <button
              key={kind}
              type="button"
              className={filter === kind ? 'selected' : ''}
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
            >
              {kind !== '전체' && <i className={`sc-dot ${kindDot[kind]}`} />}
              {kind}
            </button>
          ))}
        </div>
      </section>

      <div className="sc-grid">
        <section className="card sc-calendar" aria-label="월간 달력">
          <div className="sc-month-head">
            <button
              type="button"
              className="icon-button"
              aria-label="이전 달"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <strong aria-live="polite">
              {year}.{String(month + 1).padStart(2, '0')}
            </strong>
            <button
              type="button"
              className="icon-button"
              aria-label="다음 달"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="sc-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="sc-days">
            {Array.from({ length: totalCells }, (_, index) => {
              const day = index - firstWeekday + 1;
              if (day < 1 || day > daysInMonth) {
                const outDay = day < 1 ? prevMonthDays + day : day - daysInMonth;
                return (
                  <span key={`out-${index}`} className="sc-day sc-day-out" aria-hidden="true">
                    {outDay}
                  </span>
                );
              }
              return (
                <button
                  key={day}
                  type="button"
                  className={`sc-day ${day === selectedDay ? 'selected' : ''}`}
                  aria-label={`${month + 1}월 ${day}일, 일정 ${dayEvents(day).length}건`}
                  aria-pressed={day === selectedDay}
                  onClick={() => setSelectedDay(day)}
                >
                  {day}
                  <span className="sc-dots">
                    {dayEventList(day).map((event, index) => (
                      <i
                        key={`${event.time}-${event.title}-${index}`}
                        className={`sc-dot ${kindDot[event.kind]}`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="card sc-detail" aria-label={`${month + 1}월 ${selectedDay}일 일정 상세`}>
          <div className="card-heading">
            <div>
              <h2>
                {formatDate(
                  `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`,
                )}{' '}
                일정
              </h2>
              <p>예정 {selectedEvents.length}건</p>
            </div>
            <span className="pill pill-neutral">{filter}</span>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="rt-empty">이 날은 예정된 일정이 없어요.</p>
          ) : (
            <ul className="sc-list">
              {selectedEvents.map((event, index) => (
                <li key={`${event.day}-${event.time}-${event.title}-${index}`}>
                  <span className="sc-timeline-time">{event.time}</span>
                  <i className={`sc-node ${kindDot[event.kind]}`} />
                  <div className="sc-item-main">
                    <div className="sc-item-head">
                      <span className={`pill ${kindPill[event.kind]}`}>{event.kind}</span>
                      <strong>{event.title}</strong>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="sc-add">
            {showForm ? (
              <form className="sc-add-form" onSubmit={handleAdd}>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="일정 제목"
                  aria-label="일정 제목"
                  required
                />
                <div className="sc-add-time">
                  <FilterSelect
                    value={newHour}
                    options={hourOptions}
                    label="일정 시"
                    onChange={setNewHour}
                  />
                  <span className="sc-add-time-colon" aria-hidden="true">
                    :
                  </span>
                  <FilterSelect
                    value={newMinute}
                    options={minuteOptions}
                    label="일정 분"
                    onChange={setNewMinute}
                  />
                </div>
                <FilterSelect
                  value={newKind}
                  options={kindSelectOptions}
                  label="일정 종류"
                  onChange={(value) => setNewKind(value as CalendarEvent['kind'])}
                />
                <div className="sc-add-actions">
                  <button type="submit" className="button button-primary">
                    추가
                  </button>
                  <button
                    type="button"
                    className="button button-white"
                    onClick={() => setShowForm(false)}
                  >
                    취소
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="button button-white"
                onClick={() => setShowForm(true)}
              >
                <Plus size={15} /> 일정 추가
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Plus } from 'lucide-react';
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
const kindOptions: CalendarEvent['kind'][] = ['점검', '납품', '회의'];
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
  const [newTime, setNewTime] = useState('');
  const [newKind, setNewKind] = useState<CalendarEvent['kind']>('점검');

  const allEvents = [...calendarEvents, ...customEvents];
  const monthEvents = allEvents.filter((event) => (event.month ?? 10) === month && year === 2026);
  const dayEvents = (day: number) =>
    monthEvents.filter(
      (event) => event.day === day && (filter === '전체' || event.kind === filter),
    );
  const selectedEvents = dayEvents(selectedDay);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

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
    const time = newTime.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      onToast('시간 형식을 확인해 주세요 (예: 14:00).');
      return;
    }
    setCustomEvents((prev) => [
      ...prev,
      {
        day: selectedDay,
        time,
        title,
        kind: newKind,
        month,
        description: '이 브라우저 세션에 추가한 예시 일정이에요.',
      },
    ]);
    onToast(`${month + 1}월 ${selectedDay}일에 일정을 추가했어요. 새로고침하면 사라져요.`);
    setNewTitle('');
    setNewTime('');
    setShowForm(false);
  };

  return (
    <>
      <section className="rt-filters" aria-label="일정 종류 필터">
        <div className="segmented-control" role="group">
          {['전체', ...kindOptions].map((kind) => (
            <button
              key={kind}
              type="button"
              className={filter === kind ? 'selected' : ''}
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
            >
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
              {year}년 {month + 1}월
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
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
              <button
                key={day}
                type="button"
                className={`sc-day ${day === selectedDay ? 'selected' : ''}`}
                aria-label={`${month + 1}월 ${day}일, 일정 ${dayEvents(day).length}건`}
                aria-pressed={day === selectedDay}
                onClick={() => setSelectedDay(day)}
              >
                {day}
                {dayEvents(day).length > 0 && <i />}
              </button>
            ))}
          </div>
        </section>

        <aside className="card sc-detail" aria-label={`${month + 1}월 ${selectedDay}일 일정 상세`}>
          <div className="card-heading">
            <div>
              <h2>
                {month + 1}월 {selectedDay}일 일정
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
                  <span className={`pill ${kindPill[event.kind]}`}>{event.kind}</span>
                  <div className="sc-item-main">
                    <strong>{event.title}</strong>
                    <span>
                      <Clock3 size={13} /> {event.time}
                    </span>
                    {event.description && <p>{event.description}</p>}
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
                <input
                  value={newTime}
                  onChange={(event) => setNewTime(event.target.value)}
                  placeholder="시간 (예: 14:00)"
                  aria-label="일정 시간"
                  required
                />
                <select
                  value={newKind}
                  onChange={(event) => setNewKind(event.target.value as CalendarEvent['kind'])}
                  aria-label="일정 종류"
                >
                  {kindOptions.map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
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
            <p className="demo-disclaimer">
              일정 추가는 이 브라우저 세션에만 저장되며 새로고침하면 사라져요.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

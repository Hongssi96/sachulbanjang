import { formatDate } from '../utils/dateFormat';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import FilterSelect from '../components/FilterSelect';
import Modal from '../components/Modal';
import SegmentedControl from '../components/SegmentedControl';
import ApiErrorState from '../components/ApiErrorState';
import LoadingState from '../components/LoadingState';
import { createSchedule, deleteSchedule, fetchSchedules, updateSchedule } from '../api/schedules';
import type { ScheduleCategory, ScheduleItem } from '../api/schedules';
import { useApiQuery } from '../hooks/useApiQuery';

interface SchedulePageProps {
  onToast: (message: string) => void;
}

/** 화면에 쓰는 일정 종류. 서버 카테고리(production/other)는 '납품'으로 표시한다. */
type Kind = '점검' | '납품' | '회의';

const kindPill: Record<Kind, string> = {
  점검: 'pill-amber',
  납품: 'pill-green',
  회의: 'pill-violet',
};
const kindDot: Record<Kind, 'amber' | 'green' | 'violet'> = {
  점검: 'amber',
  납품: 'green',
  회의: 'violet',
};
const kindOptions: Kind[] = ['점검', '납품', '회의'];
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
const filterOptions: Array<Kind | '전체'> = ['전체', ...kindOptions];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 달력 칸에는 점을 최대 3개만 그리고 나머지는 +N으로 접는다.
const MAX_DAY_DOTS = 3;

interface ScheduleView {
  id: string;
  scheduleId: number;
  version: number;
  title: string;
  kind: Kind;
  allDay: boolean;
  /** 표시용 시각. 종일이면 '종일' */
  time: string;
  /** 자정 기준 분. 정렬에 사용하며 종일은 0 */
  minutes: number;
  year: number;
  month: number;
  day: number;
}

interface ApiErrorShape {
  code?: string;
  message?: string;
}

function categoryToKind(category: ScheduleCategory): Kind {
  if (category === 'inspection') return '점검';
  if (category === 'meeting') return '회의';
  return '납품';
}

function kindToCategory(kind: Kind): ScheduleCategory {
  if (kind === '점검') return 'inspection';
  if (kind === '회의') return 'meeting';
  return 'production';
}

/** ISO 시각을 Asia/Seoul 기준 연·월·일·시·분으로 나눈다. */
function seoulParts(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '0';
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  return {
    year: Number(part('year')),
    month: Number(part('month')) - 1,
    day: Number(part('day')),
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

function dateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month: month - 1, day };
}

function toView(item: ScheduleItem): ScheduleView {
  if (item.all_day && item.start_date) {
    const { year, month, day } = dateParts(item.start_date);
    return {
      id: String(item.schedule_id),
      scheduleId: item.schedule_id,
      version: item.version,
      title: item.title,
      kind: categoryToKind(item.category),
      allDay: true,
      time: '종일',
      minutes: 0,
      year,
      month,
      day,
    };
  }
  const start = item.starts_at ?? item.created_at;
  const parts = seoulParts(start);
  return {
    id: String(item.schedule_id),
    scheduleId: item.schedule_id,
    version: item.version,
    title: item.title,
    kind: categoryToKind(item.category),
    allDay: false,
    time: `${timePad(parts.hour)}:${timePad(parts.minute)}`,
    minutes: parts.minutes,
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

/** 기간(양 끝 포함)의 ISO 날짜 문자열을 만든다. */
function monthRange(year: number, month: number) {
  const first = `${year}-${timePad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const last = `${year}-${timePad(month + 1)}-${timePad(lastDay)}`;
  return { from: first, to: last };
}

export default function SchedulePage({ onToast }: SchedulePageProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [filter, setFilter] = useState('전체');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleView | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newHour, setNewHour] = useState(DEFAULT_HOUR);
  const [newMinute, setNewMinute] = useState(DEFAULT_MINUTE);
  const [newKind, setNewKind] = useState<Kind>('점검');
  const [submitting, setSubmitting] = useState(false);

  const range = monthRange(year, month);
  const scheduleQuery = useApiQuery(
    `schedule:${range.from}:${range.to}`,
    () => fetchSchedules({ from: range.from, to: range.to, pageSize: 100 }),
    { pollMs: 60_000 },
  );
  const allEvents = (scheduleQuery.data?.items ?? []).map(toView);

  const monthEvents = allEvents.filter((event) => event.year === year && event.month === month);
  const dayEvents = (day: number) =>
    monthEvents.filter(
      (event) => event.day === day && (filter === '전체' || event.kind === filter),
    );
  const dayEventList = (day: number) =>
    dayEvents(day)
      .slice()
      .sort((a, b) => a.minutes - b.minutes);
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

  const resetForm = () => {
    setNewTitle('');
    setNewHour(DEFAULT_HOUR);
    setNewMinute(DEFAULT_MINUTE);
    setNewKind('점검');
    setEditingId(null);
    setShowForm(false);
  };
  const startAdd = () => {
    resetForm();
    setShowForm(true);
  };
  const startEdit = (event: ScheduleView) => {
    setEditingId(event.id);
    setNewTitle(event.title);
    if (!event.allDay) {
      setNewHour(event.time.slice(0, 2));
      setNewMinute(event.time.slice(3, 5));
    }
    setNewKind(event.kind);
    setShowForm(true);
  };
  const reportError = (error: unknown) => {
    const apiError = error as ApiErrorShape;
    if (apiError.code === 'VERSION_CONFLICT') {
      scheduleQuery.reload();
      onToast('다른 변경이 먼저 저장되었습니다. 목록을 새로 불러왔어요.');
      return;
    }
    onToast(typeof apiError.message === 'string' ? apiError.message : '일정을 저장하지 못했어요.');
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      onToast('일정 제목을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        const target = allEvents.find((item) => item.id === editingId);
        if (target) {
          const body = { version: target.version, title, category: kindToCategory(newKind) };
          if (target.allDay) {
            await updateSchedule(target.scheduleId, body);
          } else {
            const start = `${year}-${timePad(month + 1)}-${timePad(target.day)}T${newHour}:${newMinute}:00+09:00`;
            const endMinutes = Number(newHour) * 60 + Number(newMinute) + 60;
            const endHour = timePad(Math.min(23, Math.floor(endMinutes / 60)));
            const endMinute = timePad(endMinutes % 60);
            const end = `${year}-${timePad(month + 1)}-${timePad(target.day)}T${endHour}:${endMinute}:00+09:00`;
            await updateSchedule(target.scheduleId, {
              ...body,
              allDay: false,
              startsAt: start,
              endsAt: end,
            });
          }
          onToast('일정을 수정했어요.');
        }
      } else {
        const startMinutes = Number(newHour) * 60 + Number(newMinute);
        const endMinutes = startMinutes + 60;
        const endHour = timePad(Math.min(23, Math.floor(endMinutes / 60)));
        const endMinute = timePad(endMinutes % 60);
        const date = `${year}-${timePad(month + 1)}-${timePad(selectedDay)}`;
        await createSchedule({
          title,
          category: kindToCategory(newKind),
          allDay: false,
          startsAt: `${date}T${newHour}:${newMinute}:00+09:00`,
          endsAt: `${date}T${endHour}:${endMinute}:00+09:00`,
        });
        onToast(`${month + 1}월 ${selectedDay}일에 일정을 추가했어요.`);
      }
      scheduleQuery.reload();
      resetForm();
    } catch (error: unknown) {
      reportError(error);
    } finally {
      setSubmitting(false);
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteSchedule(deleteTarget.scheduleId, deleteTarget.version);
      if (editingId === deleteTarget.id) resetForm();
      onToast('일정을 삭제했어요.');
      scheduleQuery.reload();
    } catch (error: unknown) {
      reportError(error);
    } finally {
      setSubmitting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <section className="rt-filters" aria-label="일정 종류 필터">
        <SegmentedControl
          label="일정 종류 필터"
          value={filter}
          options={filterOptions.map((kind) => ({
            value: kind,
            label: kind,
            dot: kind === '전체' ? undefined : kindDot[kind],
          }))}
          onChange={setFilter}
        />
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
          {scheduleQuery.loading && !scheduleQuery.data ? (
            <LoadingState compact label="일정을 불러오는 중이에요" />
          ) : scheduleQuery.error ? (
            <ApiErrorState compact error={scheduleQuery.error} onRetry={scheduleQuery.reload} />
          ) : (
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
                const eventsOfDay = dayEventList(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`sc-day ${day === selectedDay ? 'selected' : ''}`}
                    aria-label={`${month + 1}월 ${day}일, 일정 ${eventsOfDay.length}건`}
                    aria-pressed={day === selectedDay}
                    onClick={() => setSelectedDay(day)}
                  >
                    {day}
                    {eventsOfDay.length > 0 && (
                      <span className="sc-dots">
                        {eventsOfDay.slice(0, MAX_DAY_DOTS).map((event) => (
                          <i key={event.id} className={`sc-dot sc-dot-${kindDot[event.kind]}`} />
                        ))}
                        {eventsOfDay.length > MAX_DAY_DOTS && (
                          <span className="sc-dot-more">+{eventsOfDay.length - MAX_DAY_DOTS}</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
              {selectedEvents.map((event) => (
                <li key={event.id}>
                  <span className="sc-timeline-time">{event.time}</span>
                  <i className={`sc-node ${kindDot[event.kind]}`} />
                  <div className="sc-item-main">
                    <div className="sc-item-head">
                      <span className={`pill ${kindPill[event.kind]}`}>{event.kind}</span>
                      <strong>{event.title}</strong>
                    </div>
                  </div>
                  <div className="sc-item-actions">
                    <button
                      type="button"
                      aria-label={`${event.title} 수정`}
                      onClick={() => startEdit(event)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${event.title} 삭제`}
                      onClick={() => setDeleteTarget(event)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="sc-add">
            {showForm ? (
              <form className="sc-add-form" onSubmit={handleSubmit}>
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
                  onChange={(value) => setNewKind(value as Kind)}
                />
                <div className="sc-add-actions">
                  <button type="submit" className="button button-primary" disabled={submitting}>
                    {editingId ? '수정' : '추가'}
                  </button>
                  <button type="button" className="button button-white" onClick={resetForm}>
                    취소
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="button button-white" onClick={startAdd}>
                <Plus size={15} /> 일정 추가
              </button>
            )}
          </div>
        </aside>
      </div>

      {deleteTarget && (
        <Modal title="일정 삭제" plain onClose={() => setDeleteTarget(null)}>
          <div className="confirm-dialog">
            <p>이 일정을 삭제할까요?</p>
            <strong>
              {deleteTarget.time} · {deleteTarget.title}
            </strong>
            <div className="confirm-actions">
              <button className="button button-white" onClick={() => setDeleteTarget(null)}>
                취소
              </button>
              <button
                className="button button-primary"
                onClick={() => void confirmDelete()}
                disabled={submitting}
              >
                삭제
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

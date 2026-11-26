import { usePageEntryReady } from '../../components/PageEntry/PageEntryContext';
import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CalendarDays, UserRound } from 'lucide-react';
import { date } from '../../api/business';
import { fetchSchedule, type ScheduleCategory } from '../../api/schedules';
import useRemote from '../../hooks/useRemote';
import { RemoteState } from './LiveShared';

const categoryLabels: Record<ScheduleCategory, string> = {
  inspection: '점검',
  production: '생산',
  meeting: '회의',
  other: '기타',
};

export default function LiveScheduleDetail() {
  const { scheduleId } = useParams();
  const id = Number(scheduleId);
  const validId = Number.isInteger(id) && id >= 1;
  const schedule = useRemote(
    useCallback(
      () => (validId ? fetchSchedule(id) : Promise.reject(new Error('잘못된 일정 주소입니다.'))),
      [validId, id],
    ),
  );
  usePageEntryReady(!schedule.loading);
  const item = schedule.data;

  return (
    <div className="live-page">
      <div className="live-toolbar">
        <div>
          <Link className="live-report-back" to="/tasks">
            <ArrowLeft size={16} /> 목록으로
          </Link>
          <h1>작업 지시 상세</h1>
        </div>
      </div>

      <RemoteState {...schedule} retry={schedule.reload} />

      {item ? (
        <article className="live-card live-report-detail">
          <div className="live-report-tags">
            <span className="live-badge">{categoryLabels[item.category]}</span>
          </div>
          <h2>{item.title}</h2>
          <p className="live-muted live-report-meta">
            <UserRound size={14} /> {item.author_display_name} · {date(item.created_at)}
          </p>
          <dl className="live-schedule-info">
            <div>
              <dt>
                <CalendarDays size={13} /> 일정
              </dt>
              <dd>
                {item.all_day
                  ? `${date(item.start_date)} ~ ${date(item.end_date_exclusive)}`
                  : `${date(item.starts_at)} ~ ${date(item.ends_at)}`}
              </dd>
            </div>
            <div>
              <dt>분류</dt>
              <dd>{categoryLabels[item.category]}</dd>
            </div>
            <div>
              <dt>등록</dt>
              <dd>{date(item.created_at)}</dd>
            </div>
            <div>
              <dt>수정</dt>
              <dd>{date(item.updated_at)}</dd>
            </div>
            <div>
              <dt>버전</dt>
              <dd>v{item.version}</dd>
            </div>
          </dl>
          <p className="live-body live-schedule-description">
            {item.description || '등록된 내용이 없습니다.'}
          </p>
        </article>
      ) : null}
    </div>
  );
}

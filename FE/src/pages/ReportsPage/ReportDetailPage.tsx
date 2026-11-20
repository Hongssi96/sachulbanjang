import { Link, useParams } from 'react-router';
import { ArrowLeft, ClipboardList, Eye, FileText } from 'lucide-react';
import { reportPosts } from '../../constants/demoData';
import { setReportChecklist, useReportChecklist } from '../../services/reportChecklist';
import { setReportStatus, useReportStatus } from '../../services/reportStatus';
import type { ReportStatus } from '../../types';
import './ReportsPage.css';

const statusOptions: ReportStatus[] = ['대기', '진행 중', '완료'];
const statusPill: Record<ReportStatus, string> = {
  대기: 'pill-amber',
  '진행 중': 'pill-violet',
  완료: 'pill-green',
};
const sortedPosts = [...reportPosts].sort((a, b) =>
  `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`),
);
// 저장된 체크 상태가 없으면 처리 상태에 맞는 기본값으로 시작한다.
function defaultChecklist(status: ReportStatus, length: number): boolean[] {
  if (status === '완료') return Array.from({ length }, () => true);
  if (status === '진행 중') return Array.from({ length }, (_, index) => index === 0);
  return Array.from({ length }, () => false);
}
export default function ReportDetailPage() {
  const { reportId } = useParams();
  const index = sortedPosts.findIndex((post) => post.id === reportId);
  const post = index >= 0 ? sortedPosts[index] : null;
  const currentStatus = useReportStatus(post ?? { id: '', status: '대기' });
  const storedChecklist = useReportChecklist(reportId ?? '');
  if (!post) {
    return (
      <section className="reports-page">
        <div className="rp-empty">
          <FileText size={34} />
          <strong>보고를 찾을 수 없어요</strong>
          <p>삭제되었거나 잘못된 주소입니다.</p>
          <Link className="button button-primary" to="/reports">
            목록으로 돌아가기
          </Link>
        </div>
      </section>
    );
  }
  const newer = index > 0 ? sortedPosts[index - 1] : null;
  const older = index < sortedPosts.length - 1 ? sortedPosts[index + 1] : null;
  const checked =
    storedChecklist?.length === post.checklist.length
      ? storedChecklist
      : defaultChecklist(currentStatus, post.checklist.length);
  const completedCount = checked.filter(Boolean).length;
  const toggleItem = (target: number) => {
    const next = checked.map((value, itemIndex) => (itemIndex === target ? !value : value));
    setReportChecklist(post.id, next);
    const count = next.filter(Boolean).length;
    setReportStatus(post.id, count === next.length ? '완료' : count > 0 ? '진행 중' : '대기');
  };
  const changeStatus = (option: ReportStatus) => {
    setReportStatus(post.id, option);
    const next = checked.map(() => option === '완료');
    if (option === '진행 중') {
      if (next.every(Boolean)) next[next.length - 1] = false;
      if (next.every((value) => !value)) next[0] = true;
    }
    setReportChecklist(post.id, next);
  };
  return (
    <section className="reports-page rpd-page">
      <Link className="rpd-back" to="/reports">
        <ArrowLeft size={16} />
        목록으로
      </Link>
      <article className="rpd-article">
        <header className="rpd-header">
          <div className="rpd-tags">
            <span className="rp-category">{post.category}</span>
            <span className={`pill ${statusPill[currentStatus]}`}>{currentStatus}</span>
          </div>
          <h1>{post.title}</h1>
          <div className="rpd-meta">
            <span>
              {post.date} {post.time}
            </span>
            <i />
            <span>
              <Eye size={13} /> {post.views}
            </span>
          </div>
        </header>
        <div className="rpd-layout">
          <div className="rpd-primary">
            <div className="rpd-body">
              {post.body.split('\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
            <section className="rpd-request" aria-label="요청 사항">
              <div className="rpd-request-head">
                <h2>
                  <ClipboardList size={16} />
                  요청 사항
                </h2>
                <span className="rpd-request-count">
                  {completedCount}/{post.checklist.length} 완료
                </span>
              </div>
              <ul className="rpd-checklist">
                {post.checklist.map((item, itemIndex) => (
                  <li key={item}>
                    <label className={checked[itemIndex] ? 'is-done' : undefined}>
                      <input
                        type="checkbox"
                        checked={checked[itemIndex]}
                        onChange={() => toggleItem(itemIndex)}
                      />
                      <span>{item}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <aside className="rpd-side">
            <section className="rpd-summary" aria-label="작성자 및 설비 정보">
              <h2>작성자 · 설비</h2>
              <dl>
                <div>
                  <dt>작성자</dt>
                  <dd>{post.author}</dd>
                </div>
                <div>
                  <dt>설비</dt>
                  <dd>{post.equipment}</dd>
                </div>
                <div>
                  <dt>등록</dt>
                  <dd>
                    {post.date} {post.time}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="rpd-status-card" aria-label="처리 상태 변경">
              <span className="rpd-status-label">처리 상태</span>
              <div className="rpd-status-group" role="group">
                {statusOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-status={option}
                    className={option === currentStatus ? 'current' : undefined}
                    aria-pressed={option === currentStatus}
                    onClick={() => changeStatus(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </article>
      <nav className="rpd-nav" aria-label="이전·다음 보고">
        {newer ? (
          <Link to={`/reports/${newer.id}`}>
            <small>이전 글</small>
            <strong>{newer.title}</strong>
          </Link>
        ) : (
          <span />
        )}
        {older ? (
          <Link className="next" to={`/reports/${older.id}`}>
            <small>다음 글</small>
            <strong>{older.title}</strong>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </section>
  );
}

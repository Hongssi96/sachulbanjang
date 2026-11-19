import { Link, useParams } from 'react-router';
import { ArrowLeft, Eye, FileText } from 'lucide-react';
import { reportPosts } from '../../constants/demoData';
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
export default function ReportDetailPage() {
  const { reportId } = useParams();
  const index = sortedPosts.findIndex((post) => post.id === reportId);
  const post = index >= 0 ? sortedPosts[index] : null;
  const currentStatus = useReportStatus(post ?? { id: '', status: '대기' });
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
  return (
    <section className="reports-page">
      <Link className="rpd-back" to="/reports">
        <ArrowLeft size={16} />
        목록으로
      </Link>
      <article className="rpd-article">
        <div className="rpd-tags">
          <span className="rp-category">{post.category}</span>
          <span className={`pill ${statusPill[currentStatus]}`}>{currentStatus}</span>
        </div>
        <h1>{post.title}</h1>
        <div className="rpd-meta">
          <span>{post.author}</span>
          <i />
          <span>
            {post.date} {post.time}
          </span>
          <i />
          <span>{post.equipment}</span>
          <i />
          <span>
            <Eye size={13} /> {post.views}
          </span>
        </div>
        <div className="rpd-content">
          <div className="rpd-body">
            {post.body.split('\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
          <aside className="rpd-side">
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
                    onClick={() => setReportStatus(post.id, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </section>
            <div className="rpd-callout">
              <strong>요청 사항</strong>
              <p>{post.nextAction}</p>
            </div>
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

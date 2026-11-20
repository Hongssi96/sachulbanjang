import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, ClipboardList, Eye, Search, X } from 'lucide-react';
import { sortedReportPosts } from '../../constants/demoData';
import { getReportStatus, useReportStatusVersion } from '../../services/reportStatus';
import type { ReportPost } from '../../types';
import './ReportsPage.css';

const statusFilters = ['전체', '대기', '진행 중', '완료'] as const;
const PAGE_SIZE = 10;
const statusPill: Record<ReportPost['status'], string> = {
  대기: 'pill-amber',
  '진행 중': 'pill-violet',
  완료: 'pill-green',
};
// 최신 글 3건에만 N 표식을 붙인다. 사이드바 배지 수와 맞춘다.
const newPostIds = new Set(sortedReportPosts.slice(0, 3).map((post) => post.id));
// 페이지 번호를 앞뒤 1개씩만 두고 나머지는 말줄임으로 줄인다.
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  return [
    1,
    ...(start > 2 ? (['…'] as const) : []),
    ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ...(end < total - 1 ? (['…'] as const) : []),
    total,
  ];
}
export default function ReportsPage() {
  useReportStatusVersion();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const status = params.get('status') ?? '전체';
  const [searchInput, setSearchInput] = useState(query);
  const composingRef = useRef(false);
  const update = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      // 조건이 바뀌면 첫 페이지로 돌아간다.
      if (key !== 'page') next.delete('page');
      return next;
    });
  // URL의 검색어가 바뀌면(뒤로 가기·필터 초기화) 입력값도 맞춘다.
  useEffect(() => {
    if (!composingRef.current) setSearchInput(query);
  }, [query]);
  const changeSearch = (value: string) => {
    setSearchInput(value);
    if (!composingRef.current) update('q', value);
  };
  const keyword = query.trim().toLowerCase();
  const posts = sortedReportPosts.filter(
    (post) =>
      (status === '전체' || getReportStatus(post) === status) &&
      (!keyword ||
        `${post.title} ${post.description} ${post.body} ${post.author} ${post.equipment} ${post.category} ${post.checklist.join(' ')}`
          .toLowerCase()
          .includes(keyword)),
  );
  const counts = statusFilters.map((label) => ({
    label,
    count:
      label === '전체'
        ? sortedReportPosts.length
        : sortedReportPosts.filter((post) => getReportStatus(post) === label).length,
  }));
  const pageCount = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const requested = Number(params.get('page'));
  const page = Number.isInteger(requested) ? Math.min(Math.max(1, requested), pageCount) : 1;
  const visiblePosts = posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <section className="reports-page">
      <section className="rp-toolbar" aria-label="보고 조회 조건">
        <div className="rp-filter-group">
          <div className="rp-tabs" role="group" aria-label="처리 상태">
            {counts.map(({ label, count }) => (
              <button
                key={label}
                type="button"
                className={status === label ? 'current' : ''}
                aria-pressed={status === label}
                onClick={() => update('status', label === '전체' ? '' : label)}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rp-search" role="search">
          <Search size={16} />
          <input
            aria-label="보고 검색"
            placeholder="제목·내용·설비·작성자 검색"
            value={searchInput}
            onChange={(event) => changeSearch(event.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              changeSearch(event.currentTarget.value);
            }}
          />
          {searchInput && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => {
                setSearchInput('');
                update('q', '');
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </section>
      {posts.length ? (
        <>
          <ul className="rp-list">
            {visiblePosts.map((post) => {
              const currentStatus = getReportStatus(post);
              return (
                <li key={post.id}>
                  <Link
                    className="rp-row"
                    to={`/reports/${post.id}`}
                    aria-label={`${post.title} 상세 보기`}
                  >
                    <span className="rp-main">
                      <span className="rp-line">
                        <span className="rp-category">{post.category}</span>
                        <strong>{post.title}</strong>
                        {newPostIds.has(post.id) && (
                          <span className="rp-new">
                            N<span className="sr-only"> 새 보고</span>
                          </span>
                        )}
                      </span>
                      <span className="rp-meta">
                        <span>{post.author}</span>
                        <i />
                        <span>{post.equipment}</span>
                        <i />
                        <span>
                          {post.date} {post.time}
                        </span>
                        <i />
                        <span>
                          <Eye size={13} /> {post.views}
                        </span>
                      </span>
                    </span>
                    <span className={`pill ${statusPill[currentStatus]}`}>{currentStatus}</span>
                    <ChevronRight className="rp-arrow" size={17} />
                  </Link>
                </li>
              );
            })}
          </ul>
          {pageCount > 1 && (
            <nav className="rp-pagination" aria-label="페이지 이동">
              <button
                type="button"
                aria-label="이전 페이지"
                disabled={page === 1}
                onClick={() => update('page', String(page - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {pageWindow(page, pageCount).map((item, index) =>
                item === '…' ? (
                  <span className="rp-gap" key={`gap-${index}`}>
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={item === page ? 'current' : ''}
                    aria-current={item === page ? 'page' : undefined}
                    aria-label={`${item}페이지`}
                    onClick={() => update('page', String(item))}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label="다음 페이지"
                disabled={page === pageCount}
                onClick={() => update('page', String(page + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="rp-empty">
          <ClipboardList size={34} />
          <strong>조건에 맞는 보고가 없어요</strong>
          <p>검색어나 처리 상태를 바꿔 보세요.</p>
          <button className="button button-primary" onClick={() => setParams({})}>
            전체 보고 보기
          </button>
        </div>
      )}
    </section>
  );
}

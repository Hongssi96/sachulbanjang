import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, ClipboardList, LoaderCircle, Search, X } from 'lucide-react';
import {
  fetchReports,
  type ReportCategory,
  type ReportListItem,
  type ReportStatus,
} from '../../api/reports';
import ApiErrorState from '../../components/ApiErrorState';
import FilterSelect from '../../components/FilterSelect';
import SegmentedControl from '../../components/SegmentedControl';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { formatDateTime, todaySeoulISO } from '../../utils/dateFormat';
import './ReportsPage.css';

const statusFilters = ['전체', '대기', '진행 중', '완료'] as const;
type StatusLabel = (typeof statusFilters)[number];

const statusToLabel: Record<ReportStatus, Exclude<StatusLabel, '전체'>> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};
const statusPill: Record<Exclude<StatusLabel, '전체'>, string> = {
  대기: 'pill-amber',
  '진행 중': 'pill-violet',
  완료: 'pill-green',
};
const categoryLabels: Record<ReportCategory, string> = {
  equipment_issue: '설비 이상',
  quality_report: '품질 보고',
  inspection_done: '점검 완료',
  periodic_weekly: '주간 보고',
  periodic_monthly: '월간 보고',
  other: '기타',
};
const PAGE_SIZE = 10; // 한 페이지 최대 개수(좁은 화면은 항상 10개)
const ROW_HEIGHT = 49; // 행 48px + 구분선 1px
const MIN_ROWS = 5;

function statusOf(value: string): ReportStatus | undefined {
  if (value === '대기') return 'pending';
  if (value === '진행 중') return 'in_progress';
  if (value === '완료') return 'completed';
  return undefined;
}

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
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const status = params.get('status') ?? '전체';
  const author = params.get('author') ?? '';
  const equipment = params.get('equipment') ?? '';
  // 넓은 화면에서는 게시판 높이에 들어가는 만큼(5~10개)을 한 페이지로 보여주고,
  // 남는 높이는 행이 나눠 가진다(CSS grid 1fr).
  const boardRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const update = useCallback(
    (key: string, value: string) =>
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        // 조건이 바뀌면 첫 페이지로 돌아간다.
        if (key !== 'page') next.delete('page');
        return next;
      }),
    [setParams],
  );
  // 검색 입력은 다른 검색 화면과 같이 입력이 멈춘 뒤 결과와 URL에 반영한다.
  const {
    input: searchInput,
    setInput: setSearchInput,
    searchNow,
    compositionHandlers,
  } = useDebouncedSearch({
    value: query,
    onSearch: (value) => update('q', value),
  });

  const requested = Number(params.get('page'));
  const requestedPage = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const listQuery = useApiQuery(`reports:${query}:${status}:${requestedPage}:${pageSize}`, () =>
    fetchReports({
      q: query || undefined,
      businessStatus: statusOf(status),
      page: requestedPage,
      pageSize,
    }),
  );
  // 상태 탭 건수는 같은 검색 조건에서 상태별 한 건씩 조회해 total_items만 쓴다.
  const countsQuery = useApiQuery<Record<StatusLabel, number>>(
    `report-counts:${query}`,
    async () => {
      const count = (businessStatus?: ReportStatus) =>
        fetchReports({ q: query || undefined, businessStatus, page: 1, pageSize: 1 });
      const [all, pending, inProgress, completed] = await Promise.all([
        count(),
        count('pending'),
        count('in_progress'),
        count('completed'),
      ]);
      return {
        전체: all.pagination.total_items,
        대기: pending.pagination.total_items,
        '진행 중': inProgress.pagination.total_items,
        완료: completed.pagination.total_items,
      };
    },
  );
  // 작성자 선택지는 서버에서 받은 최근 100건에서 만든다. (작성자 필터 API는 없음)
  const authorSourceQuery = useApiQuery('report-authors', () => fetchReports({ pageSize: 100 }));
  // N 표식은 사이드바 배지와 같은 기준(당일 올라온 보고 중 미완료)을 쓴다.
  const today = todaySeoulISO();
  const openTodayQuery = useApiQuery(`report-open-today:${today}`, () =>
    fetchReports({ from: today, to: today, pageSize: 100 }),
  );
  const newPostIds = useMemo(
    () =>
      new Set(
        (openTodayQuery.data?.items ?? [])
          .filter((post) => post.business_status !== 'completed')
          .map((post) => post.report_id),
      ),
    [openTodayQuery.data],
  );
  const authorOptions = useMemo(
    () =>
      [
        ...new Set((authorSourceQuery.data?.items ?? []).map((post) => post.author_display_name)),
      ].sort(),
    [authorSourceQuery.data],
  );

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const wide = window.matchMedia('(min-width: 801px)');
    const measure = () => {
      if (!wide.matches) return setPageSize(PAGE_SIZE);
      const head = board.querySelector('.rp-head')?.getBoundingClientRect().height ?? 0;
      setPageSize(
        Math.min(
          PAGE_SIZE,
          Math.max(MIN_ROWS, Math.floor((board.clientHeight - head) / ROW_HEIGHT)),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    wide.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      wide.removeEventListener('change', measure);
    };
  }, []);

  const allPosts = listQuery.data?.items ?? [];
  // 작성자 필터는 현재 페이지에 적용한다(서버 필터 미지원).
  const visiblePosts = author
    ? allPosts.filter((post) => post.author_display_name === author)
    : allPosts;
  const pageCount = Math.max(1, listQuery.data?.pagination.total_pages ?? 0);
  const page = Math.min(requestedPage, pageCount);
  const counts = statusFilters.map((label) => ({
    label,
    count: countsQuery.data?.[label] ?? 0,
  }));
  const hasPosts = visiblePosts.length > 0;

  return (
    <section className="reports-page">
      <section className="rp-toolbar" aria-label="보고 조회 조건">
        <SegmentedControl
          label="처리 상태"
          size="md"
          value={status}
          options={counts.map(({ label, count }) => ({ value: label, label, count }))}
          onChange={(value) => update('status', value === '전체' ? '' : value)}
        />
        <div className="rp-toolbar-end">
          <FilterSelect
            label="작성자별 보기"
            value={author}
            onChange={(value) => update('author', value)}
            options={[
              { value: '', label: '전체 작성자' },
              ...authorOptions.map((value) => ({ value, label: value })),
            ]}
          />
          <FilterSelect
            label="설비별 보기"
            value={equipment}
            onChange={(value) => update('equipment', value)}
            options={[{ value: '', label: '전체 설비' }]}
          />
          <div className="rp-search" role="search">
            <Search size={16} />
            <input
              aria-label="보고 검색"
              placeholder="제목·내용·작성자 검색"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              {...compositionHandlers}
            />
            {searchInput && (
              <button type="button" aria-label="검색어 지우기" onClick={() => searchNow('')}>
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </section>
      <div className="rp-board" ref={boardRef}>
        <div className="rp-head" aria-hidden="true">
          <span>분류</span>
          <span>제목</span>
          <span>작성자</span>
          <span>설비</span>
          <span>등록 일시</span>
          <span>상태</span>
        </div>
        {listQuery.loading && !listQuery.data ? (
          <div className="rp-loading" role="status" aria-live="polite">
            <LoaderCircle size={24} />
            <span>보고를 불러오는 중이에요</span>
          </div>
        ) : listQuery.error ? (
          <ApiErrorState compact error={listQuery.error} onRetry={listQuery.reload} />
        ) : hasPosts ? (
          <ul className="rp-list" style={{ '--rp-rows': pageSize } as CSSProperties}>
            {visiblePosts.map((post: ReportListItem) => {
              const label = statusToLabel[post.business_status];
              const createdAt = formatDateTime(post.created_at);
              return (
                <li key={post.report_id}>
                  <Link
                    className="rp-row"
                    to={`/reports/${post.report_id}`}
                    aria-label={`${post.title} 상세 보기`}
                  >
                    <span>
                      <span className="rp-category">{categoryLabels[post.category]}</span>
                    </span>
                    <span className="rp-title">
                      <strong title={post.title}>{post.title}</strong>
                      {newPostIds.has(post.report_id) && (
                        <span className="rp-new">
                          N<span className="sr-only"> 새 보고</span>
                        </span>
                      )}
                    </span>
                    <span className="rp-cell">{post.author_display_name}</span>
                    <span className="rp-cell">—</span>
                    <span className="rp-cell rp-date" title={createdAt}>
                      {createdAt.slice(5)}
                    </span>
                    <span>
                      <span className={`pill ${statusPill[label]}`}>{label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rp-empty rp-empty-inside">
            <ClipboardList size={34} />
            <strong>조건에 맞는 보고가 없어요</strong>
            <p>검색어, 처리 상태, 작성자·설비 조건을 바꿔 보세요.</p>
            <button
              className="button button-primary"
              onClick={() => {
                searchNow('');
                setParams({});
              }}
            >
              전체 보고 보기
            </button>
          </div>
        )}
      </div>
      {/* 페이지 수가 바뀌어도 게시판 높이가 흔들리지 않도록 자리를 미리 잡아 둔다. */}
      <div className="rp-pagination-slot">
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
      </div>
    </section>
  );
}

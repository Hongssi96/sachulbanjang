import LoadingState from '../../components/LoadingState';
import ApiErrorState from '../../components/ApiErrorState';
import Modal from '../../components/Modal';
import {
  Fragment,
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowUpRight,
  ArrowUp,
  FileText,
  History,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  ChevronsUp,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  createConversation,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  retryTurn,
  submitTurn,
} from '../../api/conversations';
import type { ChatTurn } from '../../api/conversations';
import { fetchInspectionRecords } from '../../api/records';
import { fetchReports } from '../../api/reports';
import type { ReportStatus } from '../../api/reports';
import { formatDateTime } from '../../utils/dateFormat';
import { NA, isJobRunning, isRetryableTurn, turnAnswer, turnSources } from './chatModel';
import '../RecordsPage/RecordsPage.css';
import './ChatSearchPage.css';

const COMPOSER_MAX_HEIGHT = 140;
const LIST_PAGE_SIZE = 100;
const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateParam(value: string | null): string | undefined {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// crypto.randomUUID는 HTTPS·localhost 같은 보안 컨텍스트에서만 제공된다.
function requestKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ChatSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const handledIncoming = useRef<string | null>(null);
  const [params, rawSetParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const setParams = useCallback(
    (...args: Parameters<typeof rawSetParams>) => startTransition(() => rawSetParams(...args)),
    [rawSetParams, startTransition],
  );
  const messageList = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  // 입력창은 한 줄로 시작해 내용만큼 늘어난다(최대 COMPOSER_MAX_HEIGHT, 그 이상은 안에서 스크롤).
  useLayoutEffect(() => {
    const input = composerInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryingTurnId, setRetryingTurnId] = useState<number | null>(null);
  const [pendingTurn, setPendingTurn] = useState<{
    conversationId: number;
    turnId: number;
  } | null>(null);
  const [pollInterval, setPollInterval] = useState<number | undefined>(undefined);
  // 대화를 고르지 않았을 때 처음 보여 줄 대화는 이력 검색어가 바뀌어도 유지한다.
  const [fallbackId, setFallbackId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const searching = params.get('view') === 'search';
  const query = params.get('q') ?? '';
  const periodFrom = dateParam(params.get('from'));
  const periodTo = dateParam(params.get('to'));
  const chatParam = params.get('chat');
  const requestedId = positiveInt(chatParam);

  const update = useCallback(
    (values: Record<string, string>) =>
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        return next;
      }),
    [setParams],
  );
  // 기록 통합 검색은 입력이 멈춘 뒤 URL에 반영한다. 추천 검색어·지우기는 즉시 반영한다.
  const {
    input: searchInput,
    setInput: setSearchInput,
    searchNow: applyQuery,
    compositionHandlers,
  } = useDebouncedSearch({
    value: query,
    onSearch: (value) => update({ q: value }),
  });
  const {
    input: historyInput,
    setInput: setHistoryInput,
    compositionHandlers: historyCompositionHandlers,
  } = useDebouncedSearch({
    value: historyQuery,
    onSearch: setHistoryQuery,
  });

  // 대화 목록은 검색어·기간·페이지를 서버에 넘겨 본인 대화만 조회한다.
  const listQuery = useApiQuery(
    `chat-conversations:${historyQuery.trim()}:${periodFrom ?? ''}:${periodTo ?? ''}`,
    () =>
      fetchConversations({
        q: historyQuery.trim() || undefined,
        from: periodFrom,
        to: periodTo,
        page: 1,
        pageSize: LIST_PAGE_SIZE,
      }),
  );
  const { reload: reloadList } = listQuery;
  const conversations = listQuery.data?.items ?? [];
  const historyCount = listQuery.data?.pagination.total_items ?? conversations.length;

  useEffect(() => {
    if (chatParam || fallbackId !== null || historyQuery.trim()) return;
    const first = listQuery.data?.items[0];
    if (first) setFallbackId(first.conversation_id);
  }, [chatParam, fallbackId, historyQuery, listQuery.data]);

  const activeId = chatParam === 'new' ? null : (requestedId ?? fallbackId);
  const activeListItem = conversations.find((item) => item.conversation_id === activeId);

  // 선택한 대화의 질문·답변은 상세 조회로 가져오고, 진행 중인 작업이 있으면 2초 간격으로 갱신한다.
  const detailQuery = useApiQuery(
    `chat-conversation:${activeId ?? 'none'}`,
    () =>
      activeId === null
        ? Promise.reject(new Error('선택된 대화가 없습니다.'))
        : fetchConversation(activeId),
    { enabled: activeId !== null, pollMs: pollInterval },
  );
  const { reload: reloadDetail } = detailQuery;
  // key가 바뀐 직후에는 이전 대화 데이터가 남아 있으므로 현재 대화의 것만 사용한다.
  const detail =
    detailQuery.data && detailQuery.data.conversation_id === activeId ? detailQuery.data : null;
  const activeTurns = detail?.turns ?? [];
  const turnCount = activeTurns.length;
  const detailRunning = detail?.turns.some((turn) => isJobRunning(turn.job)) ?? false;
  const pendingTurnId =
    pendingTurn && pendingTurn.conversationId === activeId ? pendingTurn.turnId : null;
  const busy = submitting || retryingTurnId !== null || detailRunning || pendingTurnId !== null;
  const activeTitle = detail?.title ?? activeListItem?.title ?? '어떤 업무를 도와드릴까요?';
  // 처음 진입해 기본 대화를 고르는 동안에는 추천 질문보다 로딩·오류를 먼저 보여 준다.
  const waitingForDefault = !chatParam && activeId === null && listQuery.loading && !listQuery.data;
  const defaultListError =
    !chatParam && activeId === null && !listQuery.data ? listQuery.error : null;

  useEffect(() => {
    setPollInterval(detailRunning ? 2000 : undefined);
  }, [detailRunning]);

  // 접수한 질문의 작업이 끝나면 대기 표시를 해제한다.
  useEffect(() => {
    if (pendingTurnId === null || !detail) return;
    const turn = detail.turns.find((item) => item.turn_id === pendingTurnId);
    if (turn && !isJobRunning(turn.job)) setPendingTurn(null);
  }, [detail, pendingTurnId]);

  useEffect(() => {
    const list = messageList.current;
    // 질문·답변 수가 바뀔 때만 마지막 말풍선으로 이동한다.
    if (list && turnCount > 0)
      list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [turnCount, activeId, searching]);

  // 기록 통합 검색도 각 API가 제공하는 조회 결과만 사용한다.
  const searchQuery = searching && query.trim() ? query.trim() : '';
  const searchEnabled = searchQuery.length > 0;
  const reportsSearch = useApiQuery(
    `chat-search-reports:${searchQuery}`,
    () => fetchReports({ q: searchQuery, pageSize: LIST_PAGE_SIZE }),
    { enabled: searchEnabled },
  );
  const recordsSearch = useApiQuery(
    `chat-search-records:${searchQuery}`,
    () => fetchInspectionRecords({ pageSize: LIST_PAGE_SIZE }),
    { enabled: searchEnabled },
  );
  const conversationsSearch = useApiQuery(
    `chat-search-conversations:${searchQuery}`,
    () => fetchConversations({ q: searchQuery, page: 1, pageSize: LIST_PAGE_SIZE }),
    { enabled: searchEnabled },
  );
  const { reload: reloadReportsSearch } = reportsSearch;
  const { reload: reloadRecordsSearch } = recordsSearch;
  const { reload: reloadConversationsSearch } = conversationsSearch;
  const searchLoading =
    searchEnabled &&
    (reportsSearch.loading || recordsSearch.loading || conversationsSearch.loading);
  const searchError = reportsSearch.error ?? recordsSearch.error ?? conversationsSearch.error;
  const reloadSearch = useCallback(() => {
    reloadReportsSearch();
    reloadRecordsSearch();
    reloadConversationsSearch();
  }, [reloadReportsSearch, reloadRecordsSearch, reloadConversationsSearch]);

  const matches = (text: string) => text.toLowerCase().includes(searchQuery.toLowerCase());
  const recordResults =
    searchEnabled && !searchLoading && !searchError
      ? (recordsSearch.data?.items ?? [])
          .filter((item) =>
            matches(
              `${item.product_name ?? ''} ${item.product_code ?? ''} ${item.equipment_name} ${
                item.equipment_code
              } ${item.record_id} ${item.defect_type ?? ''} ${item.reason ?? ''}`,
            ),
          )
          .slice(0, 10)
      : [];
  const reportResults =
    searchEnabled && !searchLoading && !searchError ? (reportsSearch.data?.items ?? []) : [];
  const chatResults =
    searchEnabled && !searchLoading && !searchError ? (conversationsSearch.data?.items ?? []) : [];
  const totalResults = recordResults.length + reportResults.length + chatResults.length;

  const send = useCallback(
    async (text: string, startNew = false) => {
      const message = text.trim();
      if (!message || submitting || (!startNew && busy)) return;
      setSubmitting(true);
      setNotice('');
      try {
        let targetId = startNew ? null : activeId;
        if (targetId === null) {
          const created = await createConversation(message.slice(0, 35));
          targetId = created.conversation_id;
          update({ chat: String(targetId), view: '' });
          reloadList();
        }
        const accepted = await submitTurn(targetId, {
          question: message,
          clientRequestKey: requestKey(),
        });
        setPendingTurn({ conversationId: targetId, turnId: accepted.turn_id });
        update({ chat: String(targetId), view: '' });
        setDraft('');
        reloadList();
        reloadDetail();
      } catch (error) {
        setNotice(errorMessage(error, '응답을 불러오지 못했어요. 질문을 다시 보내 주세요.'));
        reloadList();
      } finally {
        setSubmitting(false);
      }
    },
    [activeId, busy, reloadDetail, reloadList, submitting, update],
  );

  // 라우터로 전달된 질문은 새 대화에 한 번만 등록한다.
  useEffect(() => {
    const state: unknown = location.state;
    if (
      typeof state !== 'object' ||
      state === null ||
      !('question' in state) ||
      typeof state.question !== 'string'
    )
      return;
    const incoming = state.question.trim();
    if (!incoming || handledIncoming.current === location.key) return;
    handledIncoming.current = location.key;
    void send(incoming, true);
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [location.key, location.state, location.pathname, location.search, navigate, send]);

  const retryAnswer = useCallback(
    async (turn: ChatTurn) => {
      if (activeId === null || retryingTurnId !== null || !isRetryableTurn(turn)) return;
      setRetryingTurnId(turn.turn_id);
      setNotice('');
      try {
        const accepted = await retryTurn(activeId, turn.turn_id, requestKey());
        setPendingTurn({ conversationId: activeId, turnId: accepted.turn_id });
        reloadDetail();
        reloadList();
      } catch (error) {
        setNotice(errorMessage(error, '다시 시도하지 못했어요. 잠시 후 다시 시도해 주세요.'));
      } finally {
        setRetryingTurnId(null);
      }
    },
    [activeId, reloadDetail, reloadList, retryingTurnId],
  );

  const removeConversation = useCallback(async () => {
    if (activeId === null || deleting) return;
    setDeleting(true);
    setNotice('');
    try {
      await deleteConversation(activeId);
      setDeleteOpen(false);
      setPendingTurn(null);
      setFallbackId(null);
      update({ chat: 'new' });
      reloadList();
      setNotice('대화를 삭제했어요.');
    } catch (error) {
      setNotice(errorMessage(error, '대화를 삭제하지 못했어요.'));
    } finally {
      setDeleting(false);
    }
  }, [activeId, deleting, reloadList, update]);

  return (
    <section className="records-page chat-page">
      {isPending && <LoadingState compact label="기록을 검색하는 중이에요" />}
      <h1 className="sr-only">대화·검색</h1>
      <div className="cs-layout">
        <aside className="rd-panel cs-history">
          <div className="cs-history-heading">
            <strong>
              <History size={17} /> 대화 이력
            </strong>
            <span>{historyCount}</span>
          </div>
          <button
            className="rd-button rd-primary cs-new"
            onClick={() => {
              update({ chat: 'new', view: '' });
              setDraft('');
            }}
          >
            <Plus size={16} /> 새 대화 시작
          </button>
          <label className="cs-history-search">
            <Search size={15} />
            <input
              aria-label="대화 이력 검색"
              placeholder="지난 대화 검색"
              value={historyInput}
              onChange={(e) => setHistoryInput(e.target.value)}
              {...historyCompositionHandlers}
            />
          </label>
          <span className="cs-section-label">저장된 대화</span>
          <div className="cs-history-items">
            {listQuery.loading && !listQuery.data && (
              <LoadingState compact label="대화 이력을 불러오는 중이에요" />
            )}
            {listQuery.error && !listQuery.data && (
              <ApiErrorState compact error={listQuery.error} onRetry={reloadList} />
            )}
            {conversations.map((item) => (
              <button
                key={item.conversation_id}
                className={!searching && activeId === item.conversation_id ? 'selected' : ''}
                onClick={() => {
                  update({ chat: String(item.conversation_id), view: '' });
                  setDraft('');
                }}
              >
                <MessageSquare size={16} />
                <span className="cs-history-title" title={item.title}>
                  {item.title}
                </span>
                <small>
                  {item.turn_count}
                  <span className="sr-only">개 질문</span>
                </small>
              </button>
            ))}
            {!listQuery.loading && !listQuery.error && conversations.length === 0 && (
              <p className="cs-muted">일치하는 대화가 없어요.</p>
            )}
          </div>
        </aside>
        <div className="rd-panel cs-main">
          <div className="rd-tabs">
            <button
              className={!searching ? 'active' : ''}
              aria-pressed={!searching}
              onClick={() => update({ view: '' })}
            >
              <MessageSquare size={15} /> 사출반장 대화
            </button>
            <button
              className={searching ? 'active' : ''}
              aria-pressed={searching}
              onClick={() => update({ view: 'search' })}
            >
              <Search size={15} /> 기록 통합 검색
            </button>
          </div>
          {searching ? (
            <div className="cs-search-content">
              <h2>찾고 싶은 기록이 있나요?</h2>
              <p className="cs-muted">검사 이력, 보고 내용, 저장된 대화를 한 번에 찾아보세요.</p>
              <label className="cs-global-search">
                <Search size={19} />
                <input
                  aria-label="기록 통합 검색"
                  placeholder="제품, 설비, 검사 번호, 키워드 입력"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  {...compositionHandlers}
                />
                {searchInput && (
                  <button aria-label="검색어 지우기" onClick={() => applyQuery('')}>
                    <X size={16} />
                  </button>
                )}
              </label>
              {!query.trim() ? (
                <div className="cs-search-empty">
                  <Search size={34} />
                  <h3>현장의 기록을 연결해 보세요</h3>
                  <p>추천 검색어</p>
                  <div className="cs-chips">
                    {['RG3 RH', 'S04', '점검', '불량률'].map((text) => (
                      <button key={text} onClick={() => applyQuery(text)}>
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="cs-results-title">
                    <strong>검색 결과</strong>
                    <span>
                      {searchLoading || searchError ? NA : `${totalResults}건`} · “{query}”
                    </span>
                  </div>
                  {searchLoading && <LoadingState compact label="기록을 검색하는 중이에요" />}
                  {!searchLoading && searchError && (
                    <ApiErrorState compact error={searchError} onRetry={reloadSearch} />
                  )}
                  {!searchLoading && !searchError && totalResults === 0 && (
                    <div className="cs-search-empty">
                      <Search size={30} />
                      <h3>일치하는 기록이 없어요</h3>
                      <p>제품명이나 설비 번호로 다시 검색해 주세요.</p>
                    </div>
                  )}
                  {recordResults.length > 0 && (
                    <section className="cs-result-group">
                      <h3>
                        생산·검사 이력 <span>{recordResults.length}</span>
                      </h3>
                      {recordResults.map((item) => (
                        <Link
                          className="cs-result"
                          key={item.record_id}
                          to={`/records/${item.record_id}`}
                        >
                          <FileText size={18} />
                          <div>
                            <strong>
                              {item.product_name ?? NA} · {item.equipment_name}
                            </strong>
                            <p>
                              {item.record_id} · {formatDateTime(item.inspected_at)}
                            </p>
                          </div>
                          <ArrowUpRight size={16} />
                        </Link>
                      ))}
                    </section>
                  )}
                  {reportResults.length > 0 && (
                    <section className="cs-result-group">
                      <h3>
                        올라온 보고 <span>{reportResults.length}</span>
                      </h3>
                      {reportResults.map((item) => (
                        <article className="cs-result" key={item.report_id}>
                          <FileText size={18} />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{NA}</p>
                            <small>
                              {item.author_display_name} · {formatDateTime(item.created_at)} ·{' '}
                              {REPORT_STATUS_LABELS[item.business_status]}
                            </small>
                          </div>
                        </article>
                      ))}
                    </section>
                  )}
                  {chatResults.length > 0 && (
                    <section className="cs-result-group">
                      <h3>
                        저장된 대화 <span>{chatResults.length}</span>
                      </h3>
                      {chatResults.map((item) => (
                        <button
                          className="cs-result"
                          key={item.conversation_id}
                          onClick={() => update({ chat: String(item.conversation_id), view: '' })}
                        >
                          <MessageSquare size={18} />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{NA}</p>
                          </div>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="cs-chat-heading">
                <span className="cs-ai-mark">
                  <ChevronsUp size={21} />
                </span>
                <div>
                  <strong>{activeTitle}</strong>
                  <p>사출반장 · 검사 기록 조회 도우미</p>
                </div>
                <span className="rd-pill good">AI</span>
                {activeId !== null && (
                  <button
                    type="button"
                    className="icon-button cs-delete"
                    aria-label="대화 삭제"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
              <div
                ref={messageList}
                className="cs-messages"
                aria-label="대화 내용"
                aria-live="polite"
              >
                {waitingForDefault && <LoadingState compact label="대화를 불러오는 중이에요" />}
                {defaultListError && (
                  <ApiErrorState compact error={defaultListError} onRetry={reloadList} />
                )}
                {!activeId && !waitingForDefault && !defaultListError && (
                  <div className="cs-welcome">
                    <ChevronsUp size={36} />
                    <h2>안녕하세요, 사출반장이에요.</h2>
                    <p>검사 기록을 물어보거나 필요한 정보를 검색해 보세요.</p>
                    <div className="cs-suggestions">
                      {[
                        '최근 검사 불량률 알려줘',
                        'RG3 RH 검사 기록 찾아줘',
                        '재고 관리 화면 안내해줘',
                      ].map((text) => (
                        <button key={text} onClick={() => send(text)}>
                          {text}
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeId !== null && detailQuery.loading && !detail && (
                  <LoadingState compact label="대화를 불러오는 중이에요" />
                )}
                {activeId !== null && detailQuery.error && !detail && (
                  <ApiErrorState compact error={detailQuery.error} onRetry={reloadDetail} />
                )}
                {activeId !== null && detail && activeTurns.length === 0 && (
                  <p className="cs-muted">아직 주고받은 질문이 없어요.</p>
                )}
                {activeTurns.map((turn) => {
                  const answer = turnAnswer(turn);
                  return (
                    <Fragment key={turn.turn_id}>
                      <article className="cs-message user">
                        <span className="cs-avatar">나</span>
                        <div>
                          <span className="cs-message-author">내 질문</span>
                          <div className="cs-bubble">
                            <p>{turn.question}</p>
                          </div>
                        </div>
                      </article>
                      <article className="cs-message assistant">
                        <span className="cs-avatar">
                          <UserRound size={16} />
                        </span>
                        <div>
                          <span className="cs-message-author">사출반장</span>
                          <div
                            className={`cs-bubble${
                              answer.kind === 'failed' ? ' cs-bubble-error' : ''
                            }`}
                          >
                            <p>{answer.text}</p>
                            {answer.kind === 'answer' && answer.note && (
                              <p className="cs-answer-note">{answer.note}</p>
                            )}
                            {answer.kind === 'failed' && (
                              <button
                                type="button"
                                className="cs-retry"
                                onClick={() => void retryAnswer(turn)}
                                disabled={retryingTurnId === turn.turn_id}
                              >
                                <RotateCcw size={14} /> 재시도
                              </button>
                            )}
                            {answer.kind === 'answer' &&
                              turnSources(turn).map((source) => (
                                <Link
                                  className="cs-source"
                                  key={`${turn.turn_id}-${source.href}`}
                                  to={source.href}
                                >
                                  <FileText size={14} />
                                  {source.label}
                                  <ArrowUpRight size={14} />
                                </Link>
                              ))}
                          </div>
                        </div>
                      </article>
                    </Fragment>
                  );
                })}
              </div>
              {submitting && <LoadingState compact label="검사 기록을 확인하는 중이에요" />}
              <form
                className="cs-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
              >
                <label htmlFor="chat-question" className="sr-only">
                  사출반장에게 질문
                </label>
                <textarea
                  ref={composerInput}
                  id="chat-question"
                  placeholder="궁금한 내용을 입력하세요. 예: RG3 RH 검사 기록 찾아줘"
                  maxLength={1000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={1}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      event.nativeEvent.keyCode !== 229
                    ) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                />
                <button
                  className="rd-button rd-primary"
                  disabled={!draft.trim() || busy}
                  type="submit"
                  aria-label="질문 보내기"
                >
                  <ArrowUp size={18} />
                </button>
              </form>
              <p className="cs-composer-hint">
                {draft.length}/1,000 · Enter 전송 · Shift+Enter 줄바꿈
              </p>
            </>
          )}
          {notice && (
            <p className="cs-storage-notice" role="status">
              {notice}
            </p>
          )}
        </div>
      </div>
      {deleteOpen && activeId !== null && (
        <Modal title="대화 삭제" plain onClose={() => setDeleteOpen(false)}>
          <div className="confirm-dialog">
            <p>이 대화를 삭제할까요?</p>
            <strong>{activeTitle}</strong>
            <div className="confirm-actions">
              <button className="button button-white" onClick={() => setDeleteOpen(false)}>
                취소
              </button>
              <button
                className="button button-primary"
                onClick={() => void removeConversation()}
                disabled={deleting}
              >
                삭제
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

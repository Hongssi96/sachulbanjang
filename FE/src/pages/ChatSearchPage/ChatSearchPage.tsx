import LoadingState from '../../components/LoadingState';
import { useEffect, useCallback, useRef, useState, useTransition } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowUpRight,
  ArrowUp,
  FileText,
  History,
  MessageSquare,
  Plus,
  Search,
  ChevronsUp,
  X,
} from 'lucide-react';
import { reports } from '../../constants/demoData';
import { productionInspectionRecords, formatRecordTimestamp } from '../../services/inspectionData';
import { loadConversations, storageKey } from './chatData';
import type { Conversation } from './chatData';
import '../RecordsPage/RecordsPage.css';
import './ChatSearchPage.css';
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
  const [answerPending, setAnswerPending] = useState(false);
  const searching = params.get('view') === 'search';
  const query = params.get('q') ?? '';
  const [conversations, setConversations] = useState(loadConversations);
  const [draft, setDraft] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [notice, setNotice] = useState('');
  const selected = conversations.find((item) => item.id === params.get('chat'));
  const active = selected ?? (!params.has('chat') ? conversations[0] : undefined);
  useEffect(() => {
    const list = messageList.current;
    if (list && active?.messages.length)
      list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active, searching]);
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
  const save = useCallback((next: Conversation[]) => {
    setConversations(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setNotice('');
    } catch {
      setNotice('브라우저 저장 공간을 사용할 수 없어 이번 화면에서만 대화가 유지됩니다.');
    }
  }, []);
  const send = useCallback(
    async (text: string, startNew = false) => {
      if (!text.trim() || answerPending) return;
      setAnswerPending(true);
      try {
        const { answerQuestion } = await import('./chatReply');
        const message = text.trim();
        const target = startNew ? undefined : active;
        const id = target?.id ?? `chat-${Date.now()}`;
        const next: Conversation = {
          id,
          title: target?.title ?? message.slice(0, 35),
          messages: [
            ...(target?.messages ?? []),
            { role: 'user', text: message },
            answerQuestion(message),
          ],
        };
        save([next, ...conversations.filter((item) => item.id !== id)]);
        update({ chat: id, view: '' });
        setDraft('');
      } catch {
        setNotice('응답을 불러오지 못했어요. 질문을 다시 보내 주세요.');
      } finally {
        setAnswerPending(false);
      }
    },
    [active, answerPending, conversations, save, update],
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
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const recordResults = query.trim()
    ? productionInspectionRecords.filter((item) =>
        matches(`${item.product} ${item.id} ${item.lotId} ${item.equipment}`),
      )
    : [];
  const reportResults = query.trim()
    ? reports.filter((item) => matches(`${item.title} ${item.description} ${item.author}`))
    : [];
  const chatResults = query.trim()
    ? conversations.filter((item) =>
        matches(`${item.title} ${item.messages.map((message) => message.text).join(' ')}`),
      )
    : [];
  const visibleHistory = conversations.filter((item) =>
    `${item.title} ${item.messages.map((message) => message.text).join(' ')}`
      .toLowerCase()
      .includes(historyQuery.toLowerCase()),
  );
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
            <span>{conversations.length}</span>
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
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
            />
          </label>
          <span className="cs-section-label">저장된 대화</span>
          <div className="cs-history-items">
            {visibleHistory.map((item) => (
              <button
                key={item.id}
                className={!searching && active?.id === item.id ? 'selected' : ''}
                onClick={() => {
                  update({ chat: item.id, view: '' });
                  setDraft('');
                }}
              >
                <MessageSquare size={16} />
                <span>
                  {item.title}
                  <small>{item.messages.length}개 메시지</small>
                </span>
              </button>
            ))}
            {!visibleHistory.length && <p className="cs-muted">일치하는 대화가 없어요.</p>}
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
                  value={query}
                  onChange={(e) => update({ q: e.target.value })}
                />
                {query && (
                  <button aria-label="검색어 지우기" onClick={() => update({ q: '' })}>
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
                      <button key={text} onClick={() => update({ q: text })}>
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
                      {recordResults.length + reportResults.length + chatResults.length}건 · “
                      {query}”
                    </span>
                  </div>
                  {recordResults.length + reportResults.length + chatResults.length === 0 && (
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
                        <Link className="cs-result" key={item.id} to={`/records/${item.id}`}>
                          <FileText size={18} />
                          <div>
                            <strong>
                              {item.product} · {item.equipment}
                            </strong>
                            <p>
                              {item.id} · {formatRecordTimestamp(item.inspectedAt)}
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
                        <article className="cs-result" key={item.id}>
                          <FileText size={18} />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.description}</p>
                            <small>
                              {item.author} · {item.time} · {item.status}
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
                          key={item.id}
                          onClick={() => update({ chat: item.id, view: '' })}
                        >
                          <MessageSquare size={18} />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.messages[0]?.text}</p>
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
                  <strong>{active?.title ?? '어떤 업무를 도와드릴까요?'}</strong>
                  <p>사출반장 · 검사 기록 조회 도우미</p>
                </div>
                <span className="rd-pill good">시연</span>
              </div>
              <div
                ref={messageList}
                className="cs-messages"
                aria-label="대화 내용"
                aria-live="polite"
              >
                {!active && (
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
                {active?.messages.map((message, index) => (
                  <article key={`${active.id}-${index}`} className={`cs-message ${message.role}`}>
                    <span className="cs-avatar">
                      {message.role === 'assistant' ? <ChevronsUp size={17} /> : '나'}
                    </span>
                    <div>
                      <span className="cs-message-author">
                        {message.role === 'assistant' ? '사출반장 · 예시 응답' : '내 질문'}
                      </span>
                      <div className="cs-bubble">
                        <p>{message.text}</p>
                        {message.href && (
                          <Link className="cs-source" to={message.href}>
                            <FileText size={14} />
                            {message.source ?? '관련 기록'}
                            <ArrowUpRight size={14} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {answerPending && <LoadingState compact label="검사 기록을 확인하는 중이에요" />}
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
                  id="chat-question"
                  placeholder="궁금한 내용을 입력하세요. 예: RG3 RH 검사 기록 찾아줘"
                  maxLength={1000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
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
                <div>
                  <span>{draft.length}/1,000 · Enter 전송 · Shift+Enter 줄바꿈</span>
                  <button
                    className="rd-button rd-primary"
                    disabled={!draft.trim() || answerPending}
                    type="submit"
                    aria-label="질문 보내기"
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </form>
            </>
          )}
          {notice && (
            <p className="cs-storage-notice" role="status">
              {notice}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

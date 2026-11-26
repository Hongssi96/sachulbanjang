import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  createConversation,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  refreshTurn,
  retryTurn,
  submitTurn,
  type ChatTurn,
  type ConversationDetail,
  type ConversationListItem,
} from '../../api/conversations';
import type { JobState } from '../../api/reportJobs';
import { date, errorMessage } from '../../api/business';
import ReportMarkdown from '../../components/ReportMarkdown';

const suggestions = [
  '최근 검사 불량 현황을 알려줘',
  '불량 검사 기록을 찾아줘',
  '최근 생산 이력을 확인해줘',
];
const activeStates: JobState[] = ['accepted', 'querying', 'writing'];
const stateLabels: Record<JobState, string> = {
  accepted: '답변 대기 중',
  querying: '관련 자료 확인 중',
  writing: '답변 작성 중',
  succeeded: '답변 완료',
  failed: '답변 생성 실패',
  interrupted: '작업 중단',
  cancelled: '작업 취소',
};

function requestKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function evidenceDescription(item: ChatTurn['evidence'][number]) {
  const sources = [
    item.report_id !== null ? `보고서 #${item.report_id}` : '',
    item.inspection_record_id !== null ? `검사 #${item.inspection_record_id}` : '',
    item.process_record_id !== null ? `생산 #${item.process_record_id}` : '',
  ].filter(Boolean);
  if (item.product_id !== null) sources.push(`제품 #${item.product_id}`);
  const version = item.source_version !== null ? ` · v${item.source_version}` : '';
  const time = item.source_time ? ` · ${date(item.source_time)}` : '';
  return `${sources.join(' · ') || '업무 자료'}${time}${version}`;
}

export default function LiveChat() {
  const { user } = useAuth();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRequest = useRef(0);
  const threadRequest = useRef(0);
  const hasPendingTurns = Boolean(
    conversation?.turns.some((turn) => turn.job && activeStates.includes(turn.job.state)),
  );
  const busy = sending || hasPendingTurns;

  const loadList = useCallback(async (query: string) => {
    const request = ++listRequest.current;
    setLoadingList(true);
    try {
      const response = await fetchConversations({ q: query, page: 1, pageSize: 100 });
      if (request === listRequest.current) setItems(response.items);
    } catch (cause) {
      if (request === listRequest.current) setError(errorMessage(cause));
    } finally {
      if (request === listRequest.current) setLoadingList(false);
    }
  }, []);

  const loadThread = useCallback(async (id: number, quiet = false) => {
    const request = ++threadRequest.current;
    if (!quiet) setLoadingThread(true);
    try {
      const response = await fetchConversation(id);
      if (request !== threadRequest.current) return;
      setConversation(response);
      setError('');
    } catch (cause) {
      if (request === threadRequest.current && !quiet) setError(errorMessage(cause));
    } finally {
      if (!quiet) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList(search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, loadList]);

  useEffect(() => {
    if (!hasPendingTurns || selectedId === null) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      await loadThread(selectedId, true);
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1800);
    };
    timer = window.setTimeout(() => void poll(), 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasPendingTurns, selectedId, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation]);

  function selectConversation(id: number) {
    setSelectedId(id);
    setConversation(null);
    setError('');
    void loadThread(id);
  }

  async function send(message = draft) {
    const question = message.trim();
    if (!question || busy) return;
    setSending(true);
    setError('');
    setDraft('');
    try {
      let activeConversation = conversation;
      if (!activeConversation) {
        activeConversation = await createConversation(question.slice(0, 72));
        setSelectedId(activeConversation.conversation_id);
        setConversation(activeConversation);
      }
      await submitTurn(activeConversation.conversation_id, {
        question,
        clientRequestKey: requestKey(),
      });
      await loadThread(activeConversation.conversation_id);
      await loadList(search);
      inputRef.current?.focus();
    } catch (cause) {
      setDraft(question);
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  function startNewChat() {
    threadRequest.current += 1;
    setSelectedId(null);
    setConversation(null);
    setDraft('');
    setError('');
    setLoadingThread(false);
    inputRef.current?.focus();
  }

  async function removeConversation(item: ConversationListItem) {
    if (!window.confirm(`“${item.title}” 대화를 삭제할까요?`)) return;
    try {
      await deleteConversation(item.conversation_id);
      if (selectedId === item.conversation_id) startNewChat();
      await loadList(search);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function runTurnAction(turn: ChatTurn, action: 'retry' | 'refresh') {
    if (!selectedId || busy) return;
    setError('');
    try {
      if (action === 'retry') await retryTurn(selectedId, turn.turn_id, requestKey());
      else await refreshTurn(selectedId, turn.turn_id, requestKey());
      await loadThread(selectedId);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="live-page live-chat-page">
      <div className="live-toolbar live-chat-toolbar">
        <div>
          <h1>든든한 현장 파트너</h1>
          <p className="live-muted">검사·생산 이력과 현장 보고를 근거로 답변합니다.</p>
        </div>
      </div>

      <section className="live-chat-shell" aria-label="현장 파트너 대화">
        <aside className="live-chat-history" aria-label="저장된 대화 목록">
          <label className="live-chat-search">
            <Search size={16} />
            <input
              aria-label="대화 검색"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="대화 검색"
            />
          </label>
          <div className="live-chat-history-list">
            {loadingList ? (
              <p className="live-chat-list-state">
                <LoaderCircle className="is-spinning" size={17} /> 대화 불러오는 중
              </p>
            ) : null}
            {!loadingList && items.length === 0 ? (
              <p className="live-chat-list-state">
                {search.trim() ? '검색 결과가 없습니다.' : '저장된 대화가 없습니다.'}
              </p>
            ) : null}
            {items.map((item) => (
              <div
                className={`live-chat-history-item${
                  selectedId === item.conversation_id ? ' is-active' : ''
                }`}
                key={item.conversation_id}
              >
                <button
                  type="button"
                  aria-current={selectedId === item.conversation_id ? 'page' : undefined}
                  onClick={() => selectConversation(item.conversation_id)}
                >
                  <strong>{item.title}</strong>
                  <small>
                    {item.turn_count}개 질문 · {date(item.updated_at)}
                  </small>
                </button>
                <button
                  className="live-chat-delete"
                  type="button"
                  aria-label={`${item.title} 대화 삭제`}
                  onClick={() => void removeConversation(item)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="live-chat-conversation">
          <div
            className={`live-chat-messages ${!conversation?.turns.length ? 'is-empty' : ''}`}
            aria-live="polite"
            aria-busy={loadingThread || sending}
          >
            {loadingThread ? (
              <div className="live-chat-loading">
                <LoaderCircle className="is-spinning" size={20} /> 대화 내용을 불러오는 중입니다.
              </div>
            ) : null}
            {!loadingThread && !conversation?.turns.length ? (
              <div className="live-chat-welcome">
                <span className="live-chat-welcome-icon">
                  <Bot size={28} />
                </span>
                <p className="live-chat-kicker">SAJUL BOSS · FIELD ASSISTANT</p>
                <h2>무엇을 도와드릴까요?</h2>
                <p className="live-chat-welcome-copy">
                  질문을 입력하면 서버에 저장하고, AI가 관련 업무 자료를 확인합니다.
                </p>
                <div className="live-chat-suggestions" aria-label="추천 질문">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {!loadingThread && conversation?.turns.length ? (
              <div className="live-chat-thread">
                {conversation.turns.map((turn) => {
                  const state = turn.job?.state;
                  const pending = state ? activeStates.includes(state) : false;
                  const failed = state === 'failed' || state === 'interrupted';
                  const showAnswer = Boolean(turn.answer) && (!state || state === 'succeeded');
                  const cutoff = turn.data_cutoff_at ?? turn.job?.data_cutoff_at ?? null;
                  return (
                    <div className="live-chat-turn-group" key={turn.turn_id}>
                      <article className="live-chat-turn user">
                        <span className="live-chat-avatar" aria-hidden="true">
                          <UserRound size={18} />
                        </span>
                        <div className="live-chat-message-body">
                          <strong>{user?.display_name ?? '나'}</strong>
                          <div className="live-chat-markdown live-report-markdown">
                            <ReportMarkdown markdown={turn.question} />
                          </div>
                          <small>{date(turn.created_at)}</small>
                        </div>
                      </article>
                      <article className="live-chat-turn assistant">
                        <span className="live-chat-avatar" aria-hidden="true">
                          <Bot size={18} />
                        </span>
                        <div className="live-chat-message-body">
                          <strong>사출반장</strong>
                          {showAnswer ? (
                            <div className="live-chat-markdown live-report-markdown">
                              <ReportMarkdown markdown={turn.answer ?? ''} />
                            </div>
                          ) : null}
                          {pending ? (
                            <div className="live-chat-job-state">
                              <LoaderCircle className="is-spinning" size={16} />
                              <span>{state ? stateLabels[state] : '답변 생성 대기 중'}</span>
                            </div>
                          ) : null}
                          {failed && state ? (
                            <div className="live-chat-job-error">
                              <AlertCircle size={16} />
                              <span>{turn.job?.safe_error_message || stateLabels[state]}</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runTurnAction(turn, 'retry')}
                              >
                                다시 시도
                              </button>
                            </div>
                          ) : null}
                          {state === 'cancelled' ? (
                            <div className="live-chat-job-error">
                              <AlertCircle size={16} />
                              <span>{stateLabels.cancelled}</span>
                            </div>
                          ) : null}
                          {showAnswer ? (
                            <div className="live-chat-answer-meta">
                              <span>
                                {turn.is_demo === null
                                  ? '데이터 구분 정보 없음'
                                  : turn.is_demo
                                    ? '시연 데이터'
                                    : '실제 업무 데이터'}
                                {cutoff ? ` · 기준 ${date(cutoff)}` : ''}
                              </span>
                              {turn.evidence.length > 0 ? (
                                <span className="live-chat-evidence">
                                  <Check size={13} /> 근거 자료
                                </span>
                              ) : (
                                <span>연결된 근거 자료 없음</span>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runTurnAction(turn, 'refresh')}
                              >
                                <RefreshCw size={13} /> 최신 데이터로 새로고침
                              </button>
                              {turn.evidence.length > 0 ? (
                                <ul className="live-chat-evidence-list">
                                  {turn.evidence.map((item, index) => (
                                    <li key={`${turn.turn_id}-${index}`}>
                                      {evidenceDescription(item)}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="live-chat-error-banner" role="alert">
              <AlertCircle size={16} /> {error}
            </div>
          ) : null}
          <form
            className="live-chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={inputRef}
              aria-label="질문 입력"
              rows={2}
              maxLength={1000}
              placeholder="현장 파트너에게 물어보세요"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="live-chat-compose-actions">
              <span>
                <Clock3 size={13} />{' '}
                {hasPendingTurns
                  ? '답변 생성 중에는 새 질문을 보낼 수 없습니다.'
                  : `${draft.length}/1,000 · Enter 전송 · Shift+Enter 줄바꿈`}
              </span>
              <button
                className="button button-primary"
                type="submit"
                disabled={!draft.trim() || busy}
              >
                {sending ? <LoaderCircle className="is-spinning" size={16} /> : <Send size={17} />}{' '}
                전송
              </button>
            </div>
          </form>
          <p className="live-chat-notice">
            대화와 답변은 계정별로 서버에 저장됩니다. 답변은 검사·생산 이력과 보고서 검색 결과를
            바탕으로 생성됩니다.
          </p>
        </div>
      </section>
    </div>
  );
}

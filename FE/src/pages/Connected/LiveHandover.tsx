import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCheck,
  ClipboardList,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import Modal from '../../components/Modal';
import useRemote from '../../hooks/useRemote';
import { useAuth } from '../../hooks/useAuth';
import { date, errorMessage } from '../../api/business';
import {
  confirmHandoverNote,
  createHandoverNote,
  deleteHandoverNote,
  fetchHandoverNote,
  fetchHandoverNotes,
  updateHandoverNote,
  type HandoverNote,
  type HandoverNoteDetail,
  type HandoverTarget,
  type HandoverTargetInput,
  type HandoverTargetKind,
} from '../../api/handover';
import { fetchMyAssignments } from '../../api/masterData';

const targetKindOrder: HandoverTargetKind[] = ['department', 'production_line', 'equipment'];
const targetKindLabels: Record<HandoverTargetKind, string> = {
  department: '부서',
  production_line: '생산라인',
  equipment: '설비',
};

function targetKey(kind: HandoverTargetKind, id: number) {
  return `${kind}:${id}`;
}

function targetName(target: HandoverTarget) {
  return target.name || target.code || `${targetKindLabels[target.kind]} #${target.target_id}`;
}

function targetInputs(keys: string[]): HandoverTargetInput[] {
  return keys.map((key) => {
    const [kind, id] = key.split(':');
    return { kind: kind as HandoverTargetKind, id: Number(id) };
  });
}

export default function LiveHandover() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editor, setEditor] = useState<'new' | HandoverNote | null>(null);
  const [formBody, setFormBody] = useState('');
  const [formTargets, setFormTargets] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState<'confirm' | 'delete' | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const notes = useRemote(
    useCallback(() => fetchHandoverNotes({ page, q: query, pageSize: 10 }), [page, query]),
  );
  const detail = useRemote(
    useCallback(
      () => (selectedId === null ? Promise.resolve(null) : fetchHandoverNote(selectedId)),
      [selectedId],
    ),
  );
  const assignments = useRemote(useCallback(() => fetchMyAssignments(), []));

  const assignmentTargets = useMemo<HandoverTarget[]>(() => {
    const data = assignments.data;
    if (!data) return [];
    return [
      ...data.departments.map((item): HandoverTarget => ({
        kind: 'department',
        target_id: item.department_id,
        code: item.code,
        name: item.name,
      })),
      ...data.production_lines.map((item): HandoverTarget => ({
        kind: 'production_line',
        target_id: item.production_line_id,
        code: item.code,
        name: item.name,
      })),
      ...data.equipment.map((item): HandoverTarget => ({
        kind: 'equipment',
        target_id: item.equipment_id,
        code: item.equipment_code,
        name: item.name,
      })),
    ];
  }, [assignments.data]);

  const targetOptions = useMemo(() => {
    const options = new Map<string, HandoverTarget>();
    assignmentTargets.forEach((target) => {
      options.set(targetKey(target.kind, target.target_id), target);
    });
    if (editor && editor !== 'new') {
      editor.targets.forEach((target) => {
        options.set(targetKey(target.kind, target.target_id), target);
      });
    }
    return [...options.values()];
  }, [assignmentTargets, editor]);

  const items = notes.data?.items ?? [];
  const totalItems = notes.data?.pagination.total_items ?? 0;
  const totalPages = notes.data?.pagination.total_pages ?? 0;
  const unconfirmed = items.filter((item) => !item.my_confirmed_at).length;
  const selectedNote: HandoverNoteDetail | null =
    detail.data && detail.data.note_id === selectedId ? detail.data : null;
  const canEdit = Boolean(selectedNote && user && selectedNote.author_id === user.id);
  const canDelete = Boolean(selectedNote && (canEdit || user?.role === 'admin'));

  function selectNote(noteId: number) {
    setSelectedId(noteId);
    setActionError('');
    setNotice('');
  }

  function openNew() {
    setEditor('new');
    setFormBody('');
    setFormTargets([]);
    setFormError('');
  }

  function openEdit(note: HandoverNote) {
    setEditor(note);
    setFormBody(note.body);
    setFormTargets(note.targets.map((target) => targetKey(target.kind, target.target_id)));
    setFormError('');
  }

  function toggleTarget(key: string, checked: boolean) {
    setFormTargets((current) =>
      checked ? [...current, key] : current.filter((value) => value !== key),
    );
  }

  async function save() {
    const body = formBody.trim();
    if (!body) {
      setFormError('인수인계 내용을 입력해 주세요.');
      return;
    }
    const targets = targetInputs(formTargets);
    if (editor && editor !== 'new' && targets.length === 0) {
      setFormError('전달 대상을 하나 이상 선택해 주세요.');
      return;
    }
    setFormBusy(true);
    setFormError('');
    try {
      if (editor === 'new') {
        const created = await createHandoverNote({
          body,
          targets: targets.length ? targets : undefined,
        });
        setEditor(null);
        setSelectedId(created.note_id);
        setNotice('인수인계를 등록했습니다.');
        if (page === 1) notes.reload();
        else setPage(1);
      } else if (editor) {
        const updated = await updateHandoverNote(editor.note_id, {
          version: editor.version,
          body,
          targets,
        });
        setEditor(null);
        setSelectedId(updated.note_id);
        setNotice('인수인계를 수정했습니다.');
        notes.reload();
        detail.reload();
      }
    } catch (cause) {
      setFormError(errorMessage(cause));
      if (editor && editor !== 'new') detail.reload();
    } finally {
      setFormBusy(false);
    }
  }

  async function confirmSelected() {
    if (!selectedNote || actionBusy) return;
    setActionBusy('confirm');
    setActionError('');
    setNotice('');
    try {
      await confirmHandoverNote(selectedNote.note_id);
      setNotice('인수인계를 확인했습니다.');
      detail.reload();
      notes.reload();
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setActionBusy(null);
    }
  }

  async function removeSelected() {
    if (!selectedNote || actionBusy) return;
    if (!window.confirm('이 인수인계를 삭제할까요?')) return;
    setActionBusy('delete');
    setActionError('');
    setNotice('');
    try {
      await deleteHandoverNote(selectedNote.note_id, selectedNote.version);
      setSelectedId(null);
      setNotice('인수인계를 삭제했습니다.');
      notes.reload();
    } catch (cause) {
      setActionError(errorMessage(cause));
      detail.reload();
    } finally {
      setActionBusy(null);
    }
  }

  function changePage(next: number) {
    setPage(next);
    setSelectedId(null);
    setActionError('');
    setNotice('');
  }

  return (
    <div className="live-page live-handover-page">
      <div className="live-handover-head">
        <div className="live-handover-head-actions">
          <button
            className="button button-white live-refresh-button"
            type="button"
            aria-label="새로고침"
            title="새로고침"
            onClick={notes.reload}
          >
            <RefreshCw size={16} />
          </button>
          <button className="button button-primary live-handover-create" onClick={openNew}>
            <Plus size={17} /> 인수인계 작성
          </button>
        </div>
      </div>

      <div className="live-handover-summary">
        <span>
          <strong>{totalItems}</strong> 전체 노트
        </span>
        <span>
          <strong>{unconfirmed}</strong> 이번 페이지 미확인
        </span>
        <span>
          <strong>{items.length - unconfirmed}</strong> 이번 페이지 확인 완료
        </span>
      </div>

      <div className="live-handover-toolbar">
        <label className="live-handover-search">
          <Search size={17} />
          <input
            aria-label="인수인계 검색"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="전달 내용 검색"
          />
        </label>
        <span className="live-muted">
          {user?.role === 'admin'
            ? '전체 인수인계를 표시합니다.'
            : '내 소속·담당 설비 기준으로 표시됩니다.'}
        </span>
      </div>

      {notice ? (
        <p className="live-handover-notice" role="status">
          <Check size={15} /> {notice}
        </p>
      ) : null}

      <RemoteStateCheck resource={notes} />
      {notes.data ? (
        <div className="live-handover-layout">
          <section className="live-handover-list-panel" aria-label="인수인계 목록">
            {items.length === 0 ? (
              <div className="live-handover-empty">
                <span>
                  <ClipboardList size={28} />
                </span>
                <h2>{query ? '검색 결과가 없습니다.' : '등록된 인수인계가 없습니다.'}</h2>
                <p className="live-muted">
                  {query
                    ? '다른 검색어로 다시 확인해 주세요.'
                    : '다음 근무자를 위해 전달할 내용을 남겨 주세요.'}
                </p>
                {!query ? (
                  <button className="button button-primary" onClick={openNew}>
                    <Plus size={17} /> 첫 인수인계 작성
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="live-handover-list">
                  {items.map((note) => {
                    const confirmed = Boolean(note.my_confirmed_at);
                    return (
                      <button
                        key={note.note_id}
                        type="button"
                        className={`live-handover-item${
                          selectedId === note.note_id ? ' is-active' : ''
                        }`}
                        aria-current={selectedId === note.note_id ? 'true' : undefined}
                        onClick={() => selectNote(note.note_id)}
                      >
                        <div className="live-handover-item-top">
                          <div className="live-handover-targets">
                            {note.targets.length ? (
                              note.targets.map((target) => (
                                <span
                                  className="live-handover-target"
                                  key={targetKey(target.kind, target.target_id)}
                                >
                                  {targetName(target)}
                                </span>
                              ))
                            ) : (
                              <span className="live-handover-target">기본 대상</span>
                            )}
                          </div>
                          <span
                            className={`live-handover-state ${
                              confirmed ? 'is-confirmed' : 'is-unconfirmed'
                            }`}
                          >
                            {confirmed ? '확인함' : '미확인'}
                          </span>
                        </div>
                        <p className="live-handover-preview">{note.body}</p>
                        <div className="live-handover-meta">
                          <span>
                            <UserRound size={13} /> {note.author_display_name}
                          </span>
                          <span>{date(note.created_at)}</span>
                          <span>
                            <CheckCheck size={13} /> {note.confirmed_count}명 확인
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="live-pager live-handover-pager">
                  <button
                    className="button button-white"
                    disabled={page <= 1}
                    onClick={() => changePage(page - 1)}
                  >
                    이전
                  </button>
                  <span>
                    {page} / {Math.max(1, totalPages)} · 전체 {totalItems}건
                  </span>
                  <button
                    className="button button-white"
                    disabled={totalPages === 0 || page >= totalPages}
                    onClick={() => changePage(page + 1)}
                  >
                    다음
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="live-handover-detail-panel" aria-label="인수인계 상세">
            {selectedId === null ? (
              <div className="live-handover-detail live-handover-empty">
                <span>
                  <ClipboardList size={28} />
                </span>
                <h2>인수인계를 선택하세요</h2>
                <p className="live-muted">
                  왼쪽 목록에서 노트를 선택하면 전달 내용과 확인 현황을 볼 수 있습니다.
                </p>
              </div>
            ) : (
              <>
                <RemoteStateCheck resource={detail} />
                {selectedNote ? (
                  <article className="live-handover-detail">
                    <div className="live-handover-detail-head">
                      <div>
                        <div className="live-handover-targets">
                          {selectedNote.targets.map((target) => (
                            <span
                              className="live-handover-target"
                              key={targetKey(target.kind, target.target_id)}
                            >
                              <small>{targetKindLabels[target.kind]}</small>
                              {targetName(target)}
                            </span>
                          ))}
                        </div>
                        <p className="live-handover-detail-meta">
                          <UserRound size={14} /> {selectedNote.author_display_name} ·{' '}
                          {date(selectedNote.created_at)}
                          {selectedNote.updated_at !== selectedNote.created_at
                            ? ` · 수정 ${date(selectedNote.updated_at)}`
                            : ''}
                        </p>
                      </div>
                      <span
                        className={`live-handover-state ${
                          selectedNote.my_confirmed_at ? 'is-confirmed' : 'is-unconfirmed'
                        }`}
                      >
                        {selectedNote.my_confirmed_at ? '확인함' : '미확인'}
                      </span>
                    </div>

                    <p className="live-handover-body">{selectedNote.body}</p>

                    <div className="live-handover-confirm-box">
                      <div>
                        <strong>확인 {selectedNote.confirmed_count}명</strong>
                        <p className="live-muted">
                          {selectedNote.my_confirmed_at
                            ? `내 확인 ${date(selectedNote.my_confirmed_at)}`
                            : '아직 확인하지 않았습니다.'}
                        </p>
                      </div>
                      <button
                        className="button button-primary"
                        disabled={Boolean(selectedNote.my_confirmed_at) || actionBusy !== null}
                        onClick={() => void confirmSelected()}
                      >
                        {selectedNote.my_confirmed_at ? (
                          <>
                            <Check size={16} /> 확인 완료
                          </>
                        ) : actionBusy === 'confirm' ? (
                          <>
                            <LoaderCircle className="is-spinning" size={16} /> 확인 중
                          </>
                        ) : (
                          '확인함'
                        )}
                      </button>
                    </div>

                    {actionError ? (
                      <p className="live-error" role="alert">
                        <AlertCircle size={16} /> {actionError}
                      </p>
                    ) : null}

                    {canEdit || canDelete ? (
                      <div className="live-handover-actions">
                        {canEdit ? (
                          <button
                            className="button button-white"
                            disabled={actionBusy !== null}
                            onClick={() => openEdit(selectedNote)}
                          >
                            <Pencil size={15} /> 수정
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            className="button button-white live-handover-delete"
                            disabled={actionBusy !== null}
                            onClick={() => void removeSelected()}
                          >
                            {actionBusy === 'delete' ? (
                              <LoaderCircle className="is-spinning" size={15} />
                            ) : (
                              <Trash2 size={15} />
                            )}{' '}
                            삭제
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    <section className="live-handover-confirmations">
                      <h3>확인한 근무자</h3>
                      {selectedNote.confirmations.length ? (
                        <ul>
                          {selectedNote.confirmations.map((confirmation) => (
                            <li key={confirmation.user_id}>
                              <span className="live-handover-confirm-avatar">
                                {confirmation.display_name.slice(0, 1)}
                              </span>
                              <div>
                                <strong>{confirmation.display_name}</strong>
                                <small>{date(confirmation.confirmed_at)}</small>
                              </div>
                              <Check size={15} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="live-muted">아직 확인한 근무자가 없습니다.</p>
                      )}
                    </section>
                  </article>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}

      {editor ? (
        <Modal
          title={editor === 'new' ? '인수인계 작성' : '인수인계 수정'}
          onClose={() => {
            if (!formBusy) setEditor(null);
          }}
          wide
        >
          <form
            className="live-form live-handover-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              전달 내용
              <textarea
                name="body"
                required
                value={formBody}
                onChange={(event) => setFormBody(event.target.value)}
                placeholder="다음 근무자에게 전달할 내용을 입력하세요."
              />
            </label>

            <fieldset className="live-handover-target-box" disabled={formBusy}>
              <legend>전달 대상</legend>
              <p className="live-muted">
                {editor === 'new'
                  ? '선택하지 않으면 내 소속·담당 설비를 기준으로 전달됩니다.'
                  : '전달 대상을 수정하려면 최소 한 개를 선택해 주세요.'}
              </p>
              {assignments.loading ? (
                <p className="live-muted">
                  <LoaderCircle className="is-spinning" size={15} /> 대상을 불러오는 중입니다.
                </p>
              ) : null}
              {assignments.error ? (
                <p className="live-error" role="alert">
                  {assignments.error}
                </p>
              ) : null}
              {!assignments.loading && targetOptions.length === 0 ? (
                <p className="live-muted">선택할 수 있는 대상이 없습니다.</p>
              ) : null}
              {targetKindOrder.map((kind) => {
                const options = targetOptions.filter((target) => target.kind === kind);
                if (!options.length) return null;
                return (
                  <fieldset className="live-handover-target-group" key={kind}>
                    <legend>{targetKindLabels[kind]}</legend>
                    <div>
                      {options.map((target) => {
                        const key = targetKey(target.kind, target.target_id);
                        return (
                          <label className="live-handover-target-option" key={key}>
                            <input
                              type="checkbox"
                              checked={formTargets.includes(key)}
                              onChange={(event) => toggleTarget(key, event.target.checked)}
                            />
                            <span>
                              <strong>{target.name}</strong>
                              {target.code ? <small>{target.code}</small> : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </fieldset>

            {formError ? (
              <p className="live-error" role="alert">
                <AlertCircle size={16} /> {formError}
              </p>
            ) : null}

            <div className="live-handover-form-actions">
              <button
                className="button button-white"
                type="button"
                disabled={formBusy}
                onClick={() => setEditor(null)}
              >
                취소
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={formBusy || !formBody.trim()}
              >
                {formBusy ? (
                  <>
                    <LoaderCircle className="is-spinning" size={16} /> 저장 중
                  </>
                ) : editor === 'new' ? (
                  '등록'
                ) : (
                  '저장'
                )}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function RemoteStateCheck({
  resource,
}: {
  resource: { loading: boolean; error: string; reload: () => void };
}) {
  if (resource.loading)
    return (
      <div className="live-handover-loading">
        <LoaderCircle className="is-spinning" size={18} /> 인수인계를 불러오는 중입니다.
      </div>
    );
  if (resource.error)
    return (
      <div className="live-error" role="alert">
        {resource.error}{' '}
        <button className="button button-white" onClick={resource.reload}>
          다시 조회
        </button>
      </div>
    );
  return null;
}

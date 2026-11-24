import { useCallback, useState } from 'react';
import useRemote from '../../hooks/useRemote';
import { useAuth } from '../../hooks/useAuth';
import { formText, list, number, object, text, write } from '../../api/business';
import type { Row } from '../../api/business';
import { Field, MutationDialog, Pager, RemoteState, Select, Table } from './LiveShared';
import Modal from '../../components/Modal';

export default function LiveUsers() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Row | null>(null);
  const resource = useRemote(
    useCallback(
      () =>
        user?.role === 'admin'
          ? list(`/users?page=${page}&page_size=10`)
          : Promise.resolve({ items: [], total: 0, pages: 0 }),
      [page, user?.role],
    ),
  );
  if (user?.role !== 'admin')
    return (
      <div className="live-page">
        <p>계정 발급은 관리자만 이용할 수 있습니다.</p>
      </div>
    );
  return (
    <div className="live-page">
      <div className="live-toolbar">
        <h1>계정 발급</h1>
        <button className="button button-primary" onClick={() => setOpen(true)}>
          사번 계정 발급
        </button>
      </div>
      <RemoteState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <div className="live-card">
            <Table
              rows={resource.data.items}
              columns={[
                ['employee_no', '사번'],
                ['display_name', '이름'],
                ['role', '권한', (row) => (row.role === 'admin' ? '관리자' : '현장 근무자')],
                ['is_active', '활성 상태'],
                ['shift_start_local', '근무 시작'],
                ['shift_end_local', '근무 종료'],
              ]}
            />
          </div>
          <Pager data={resource.data} page={page} setPage={setPage} />
        </>
      )}
      {open && (
        <MutationDialog
          title="사번 계정 발급"
          close={() => {
            setOpen(false);
            resource.reload();
          }}
          submit={async (form) => {
            const data = object(
              await write('/users', 'POST', {
                employee_no: formText(form, 'employee_no'),
                display_name: formText(form, 'display_name'),
                role: formText(form, 'role'),
                shift_start_local: formText(form, 'start'),
                shift_end_local: formText(form, 'end'),
              }),
            );
            if (typeof data.temporary_password !== 'string' || !number(data.user_id))
              throw new Error(
                '발급 응답을 확인해 주세요. 계정 목록에서 생성 여부를 확인한 뒤 다시 시도해 주세요.',
              );
            setIssued(data);
          }}
        >
          <Field name="employee_no" label="사번" />
          <Field name="display_name" label="이름" />
          <Select
            name="role"
            label="권한"
            options={[
              ['worker', '현장 근무자'],
              ['admin', '관리자'],
            ]}
          />
          <Field name="start" label="근무 시작" type="time" value="09:00" />
          <Field name="end" label="근무 종료" type="time" value="18:00" />
        </MutationDialog>
      )}
      {issued && !open && (
        <Modal title="계정 발급 완료" onClose={() => setIssued(null)}>
          <div className="live-form">
            <p>사번: {text(issued.employee_no)}</p>
            <p>
              임시 비밀번호는 이 창에서 한 번만 표시됩니다. 해당 근무자에게 안전하게 전달해 주세요.
            </p>
            <code className="live-body">{text(issued.temporary_password)}</code>
            <p>첫 로그인 후 비밀번호를 변경해야 업무 화면을 이용할 수 있습니다.</p>
            <button className="button button-primary" onClick={() => setIssued(null)}>
              확인
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

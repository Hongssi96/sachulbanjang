import { formText } from '../../api/business';
import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import useRemote from '../../hooks/useRemote';
import { date, list, number, query, read, text, write } from '../../api/business';
import { Field, MutationDialog, Pager, RemoteState, Select, Table } from './LiveShared';
import { useAuth } from '../../hooks/useAuth';
import { formatNumber } from '../../utils/numberFormat';

export default function LiveRecords({
  detail = false,
  precision = false,
}: {
  detail?: boolean;
  precision?: boolean;
}) {
  const { recordId } = useParams();
  const [params, setParams] = useSearchParams();
  const inspection = params.get('kind') !== 'production';
  const endpoint = inspection ? '/inspection-records' : '/process-records';
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [equipment, setEquipment] = useState('');
  const [product, setProduct] = useState('');
  const [verdict, setVerdict] = useState('');
  const [editing, setEditing] = useState(false);
  const { user } = useAuth();
  const masters = useRemote(
    useCallback(
      async () => ({ equipment: await list('/equipment'), products: await list('/products') }),
      [],
    ),
  );
  const load = useCallback(
    () =>
      list(
        query(endpoint, {
          page,
          page_size: 10,
          from,
          to,
          equipment_id: equipment,
          product_id: product,
          verdict: inspection ? verdict : undefined,
        }),
      ),
    [endpoint, page, from, to, equipment, product, verdict, inspection],
  );
  const resource = useRemote(load);
  const item = useRemote(
    useCallback(
      () =>
        detail && recordId
          ? read(`${endpoint}/${recordId}`)
          : Promise.resolve<Record<string, unknown>>({}),
      [detail, recordId, endpoint],
    ),
  );
  if (detail)
    return (
      <div className="live-page">
        <Link
          className="button button-white"
          to={`/records?kind=${inspection ? 'inspection' : 'production'}`}
        >
          ← 생산·검사 기록으로
        </Link>
        <h1>{precision ? '정밀 검사 기록 확인' : '생산·검사 상세'}</h1>
        <RemoteState {...item} retry={item.reload} />
        {item.data && !item.loading && !item.error && (
          <section className="live-card">
            <dl className="live-detail">
              {[
                ['record_id', '기록 번호'],
                ['equipment_code', '설비'],
                ['product_name', '제품'],
                ['version', '기록 버전'],
                [inspection ? 'inspected_at' : 'occurred_at', '일시'],
                ...(inspection
                  ? [
                      ['verdict', '판정'],
                      ['defect_type', '불량 유형'],
                      ['reason', '검사 사유'],
                    ]
                  : [['cycle_time_seconds', '사이클 시간(초)']]),
              ].map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {key.endsWith('_at')
                      ? date(item.data?.[key])
                      : typeof item.data?.[key] === 'number' && !Number.isInteger(item.data[key])
                        ? formatNumber(item.data[key])
                        : text(item.data?.[key])}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="live-muted">
              {item.data.is_demo
                ? '서버에 적재된 시연 기록이 포함되어 있습니다.'
                : '서버에 저장된 기록입니다.'}
            </p>
            {user?.role === 'admin' && (
              <button className="button button-white" onClick={() => setEditing(true)}>
                기록 정정
              </button>
            )}
            {precision && (
              <p>
                센서 기반 정밀 측정·사진 분석 API는 아직 제공되지 않습니다. 저장된 검사 결과를
                확인할 수 있습니다.
              </p>
            )}
          </section>
        )}
        {editing && item.data && (
          <MutationDialog
            title="기록 정정"
            close={() => {
              setEditing(false);
              item.reload();
            }}
            submit={async (form) => {
              await write(`${endpoint}/${recordId}`, 'PATCH', {
                version: item.data?.version,
                change_reason: formText(form, 'change_reason'),
                ...(inspection
                  ? {
                      verdict: formText(form, 'verdict'),
                      reason: formText(form, 'reason') || null,
                      defect_type: formText(form, 'defect_type') || null,
                    }
                  : { cycle_time_seconds: Number(formText(form, 'cycle')) }),
              });
            }}
          >
            <Field name="change_reason" label="정정 사유" />
            {inspection ? (
              <>
                <Select
                  name="verdict"
                  label="검사 판정"
                  options={[
                    ['good', '양품'],
                    ['defect', '불량'],
                  ]}
                  value={text(item.data.verdict)}
                />
                <Field
                  name="reason"
                  label="검사 사유"
                  value={item.data.reason ? text(item.data.reason) : ''}
                  required={false}
                />
                <Field
                  name="defect_type"
                  label="불량 유형"
                  value={item.data.defect_type ? text(item.data.defect_type) : ''}
                  required={false}
                />
              </>
            ) : (
              <Field
                name="cycle"
                label="사이클 시간(초)"
                type="number"
                value={text(item.data.cycle_time_seconds)}
              />
            )}
          </MutationDialog>
        )}
      </div>
    );
  return (
    <div className="live-page">
      <h1>생산·검사 이력</h1>
      <div className="live-tabs">
        {[
          ['inspection', '검사 기록'],
          ['production', '생산 기록'],
        ].map(([kind, label]) => (
          <button
            key={kind}
            aria-pressed={inspection === (kind === 'inspection')}
            onClick={() => {
              setParams({ kind });
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="live-card live-filters">
        <label>
          시작일
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          종료일 (미포함)
          <input
            type="date"
            min={from}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          설비
          <select
            value={equipment}
            onChange={(event) => {
              setEquipment(event.target.value);
              setPage(1);
            }}
          >
            <option value="">전체</option>
            {masters.data?.equipment.items.map((row) => (
              <option key={number(row.equipment_id)} value={text(row.equipment_id)}>
                {text(row.equipment_code)} · {text(row.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          제품
          <select
            value={product}
            onChange={(event) => {
              setProduct(event.target.value);
              setPage(1);
            }}
          >
            <option value="">전체</option>
            {masters.data?.products.items.map((row) => (
              <option key={number(row.product_id)} value={text(row.product_id)}>
                {text(row.name)}
              </option>
            ))}
          </select>
        </label>
        {inspection && (
          <label>
            판정
            <select
              value={verdict}
              onChange={(event) => {
                setVerdict(event.target.value);
                setPage(1);
              }}
            >
              <option value="">전체</option>
              <option value="good">양품</option>
              <option value="defect">불량</option>
            </select>
          </label>
        )}
        <button className="button button-white" onClick={resource.reload}>
          조회
        </button>
      </div>
      <RemoteState {...masters} retry={masters.reload} />
      <RemoteState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <section className="live-card">
            <Table
              rows={resource.data.items}
              columns={[
                ['record_id', '기록 번호'],
                ['equipment_code', '설비'],
                ['product_name', '제품'],
                [
                  inspection ? 'inspected_at' : 'occurred_at',
                  '일시',
                  (row) => date(row[inspection ? 'inspected_at' : 'occurred_at']),
                ],
                [
                  inspection ? 'verdict' : 'cycle_time_seconds',
                  inspection ? '판정' : '사이클(초)',
                  (row) =>
                    inspection ? (
                      <span className={`live-badge ${row.verdict === 'defect' ? 'bad' : ''}`}>
                        {row.verdict === 'defect' ? '불량' : '양품'}
                      </span>
                    ) : row.cycle_time_seconds === null || row.cycle_time_seconds === undefined ? (
                      '—'
                    ) : (
                      formatNumber(number(row.cycle_time_seconds))
                    ),
                ],
              ]}
              action={(row) => (
                <Link
                  className="button button-white"
                  to={`/records/${number(row.record_id)}?kind=${inspection ? 'inspection' : 'production'}`}
                >
                  상세 보기
                </Link>
              )}
            />
          </section>
          <Pager data={resource.data} page={page} setPage={setPage} />
        </>
      )}
    </div>
  );
}

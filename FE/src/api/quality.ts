import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asDecimal,
  asNullableString,
  asNullableNumber,
  asNumber,
  asRecord,
  toQuery,
} from './json';

export interface DefectTypeCount {
  type: string | null;
  count: number;
}

export interface QualitySummary {
  inspected_count: number;
  good_count: number;
  defect_count: number;
  defect_rate: number | null;
  defect_types: DefectTypeCount[];
  production_record_count: number;
  produced_quantity: number | null;
  target_quantity: number | null;
  includes_demo: boolean;
}

export interface QualitySummaryParams {
  from?: string;
  to?: string;
  equipmentId?: number;
  productId?: number;
}

export interface OperationSummary {
  equipment_id: number | null;
  from_date: string | null;
  to_date: string | null;
  planned_hours: number;
  actual_hours: number;
  operation_rate: number | null;
  includes_demo: boolean;
}

export async function fetchOperationSummary(
  params: Omit<QualitySummaryParams, 'productId'> = {},
): Promise<OperationSummary> {
  const payload = asRecord(
    await apiRequest<unknown>(
      `/quality/operation${toQuery({
        from: params.from,
        to: params.to,
        equipment_id: params.equipmentId,
      })}`,
    ),
    'operationSummary',
  );
  const plannedHours = asDecimal(payload.planned_hours, 'operationSummary.planned_hours');
  const actualHours = asDecimal(payload.actual_hours, 'operationSummary.actual_hours');
  if (plannedHours === null || actualHours === null) {
    throw new Error('가동 시간 응답을 확인해 주세요.');
  }
  return {
    equipment_id: asNullableNumber(payload.equipment_id, 'operationSummary.equipment_id'),
    from_date: asNullableString(payload.from_date, 'operationSummary.from_date'),
    to_date: asNullableString(payload.to_date, 'operationSummary.to_date'),
    planned_hours: plannedHours,
    actual_hours: actualHours,
    operation_rate: asDecimal(payload.operation_rate, 'operationSummary.operation_rate'),
    includes_demo: asBoolean(payload.includes_demo, 'operationSummary.includes_demo'),
  };
}

export async function fetchQualitySummary(
  params: QualitySummaryParams = {},
): Promise<QualitySummary> {
  const payload = asRecord(
    await apiRequest<unknown>(
      `/quality/summary${toQuery({
        from: params.from,
        to: params.to,
        equipment_id: params.equipmentId,
        product_id: params.productId,
      })}`,
    ),
    'qualitySummary',
  );
  return {
    inspected_count: asNumber(payload.inspected_count, 'qualitySummary.inspected_count'),
    good_count: asNumber(payload.good_count, 'qualitySummary.good_count'),
    defect_count: asNumber(payload.defect_count, 'qualitySummary.defect_count'),
    defect_rate: asDecimal(payload.defect_rate, 'qualitySummary.defect_rate'),
    defect_types: asArray(payload.defect_types, 'qualitySummary.defect_types').map(
      (item, index) => {
        const record = asRecord(item, `defect_types[${index}]`);
        return {
          type: asNullableString(record.type, `defect_types[${index}].type`),
          count: asNumber(record.count, `defect_types[${index}].count`),
        };
      },
    ),
    production_record_count: asNumber(
      payload.production_record_count,
      'qualitySummary.production_record_count',
    ),
    produced_quantity: asNullableNumber(
      payload.produced_quantity,
      'qualitySummary.produced_quantity',
    ),
    target_quantity: asNullableNumber(payload.target_quantity, 'qualitySummary.target_quantity'),
    includes_demo: asBoolean(payload.includes_demo, 'qualitySummary.includes_demo'),
  };
}

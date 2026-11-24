import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asDecimal,
  asNullableString,
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
  includes_demo: boolean;
}

export interface QualitySummaryParams {
  from?: string;
  to?: string;
  equipmentId?: number;
  productId?: number;
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
    includes_demo: asBoolean(payload.includes_demo, 'qualitySummary.includes_demo'),
  };
}

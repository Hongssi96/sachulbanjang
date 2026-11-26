const numberFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
const decimalFormatter = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/** 화면 표시만 반올림하고 원본 수치는 유지한다. 정수에는 소수점을 붙이지 않는다. */
export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : numberFormatter.format(value);
}

/** 비율·증감 수치는 소수점 한 자리를 항상 표시한다. */
export function formatDecimal(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : decimalFormatter.format(value);
}

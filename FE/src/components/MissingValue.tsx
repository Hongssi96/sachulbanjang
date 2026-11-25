/**
 * 값이 없을 때 대시 문자(—) 대신 쓰는 자리 표시.
 * 텍스트가 아니라 짧고 둥근 검은 선으로 그려, 단위(%, 건, 대)를 붙이지 않는다.
 */
export default function MissingValue({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`missing-value${size === 'lg' ? ' is-lg' : ''}`}
      role="img"
      aria-label="데이터 없음"
      title="데이터가 없어요"
    >
      <i aria-hidden="true" />
    </span>
  );
}

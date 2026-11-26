/** 보고 본문의 마크다운 표식을 덜어내고 검색어 주변을 발췌한다. */
export function reportPreview(markdown: string, query: string): string {
  const text = markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(\*\*|__|`+)(.*?)\1/g, '$2')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '작성된 본문이 없어요.';
  const keyword = query.trim().toLowerCase();
  const matchIndex = keyword ? text.toLowerCase().indexOf(keyword) : -1;
  const start = Math.max(0, matchIndex - 40);
  const end = start + 180;
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${text.length > end ? '…' : ''}`;
}

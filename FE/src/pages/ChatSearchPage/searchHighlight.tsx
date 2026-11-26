import type { ReactNode } from 'react';

export function highlightMatches(text: string, query: string): ReactNode {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return text;
  const normalized = text.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let index = normalized.indexOf(keyword);
  while (index !== -1) {
    parts.push(text.slice(start, index));
    parts.push(
      <mark className="cs-search-highlight" key={index}>
        {text.slice(index, index + keyword.length)}
      </mark>,
    );
    start = index + keyword.length;
    index = normalized.indexOf(keyword, start);
  }
  parts.push(text.slice(start));
  return parts;
}

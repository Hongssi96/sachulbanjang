import type { ReactNode } from 'react';

// 보고 본문(body_markdown)은 제목·목록·굵게만 쓰는 좁은 마크다운이다.
// 전체 마크다운 라이브러리를 들이지 않고, 화면에 그대로 노출되던 기호만 해석한다.
type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

const headingPattern = /^(#{1,6})\s+(.*)$/;
const bulletPattern = /^[-*]\s+(.*)$/;
const orderedPattern = /^\d+[.)]\s+(.*)$/;

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }

    const heading = headingPattern.exec(line);
    if (heading) {
      flushList();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    const bullet = bulletPattern.exec(line);
    if (bullet) {
      const item = bullet[1];
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [item] };
      } else {
        list.items.push(item);
      }
      continue;
    }

    const ordered = orderedPattern.exec(line);
    if (ordered) {
      const item = ordered[1];
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [item] };
      } else {
        list.items.push(item);
      }
      continue;
    }

    flushList();
    blocks.push({ kind: 'paragraph', text: line });
  }
  flushList();
  return blocks;
}

// **굵게**, `코드`만 인라인으로 해석한다. HTML은 해석하지 않으므로 그대로 문자열로 남는다.
const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(inlinePattern).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function ReportMarkdown({ markdown }: { markdown: string }) {
  return (
    <>
      {parseBlocks(markdown).map((block, index) => {
        if (block.kind === 'heading') {
          if (block.level <= 2) return <h2 key={index}>{renderInline(block.text)}</h2>;
          if (block.level === 3) return <h3 key={index}>{renderInline(block.text)}</h3>;
          return <h4 key={index}>{renderInline(block.text)}</h4>;
        }
        if (block.kind === 'list') {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ));
          return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </>
  );
}

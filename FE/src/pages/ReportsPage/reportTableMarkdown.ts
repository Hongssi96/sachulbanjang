// 보고 본문(body_markdown) 안의 표만 찾아 셀 단위로 고칠 수 있게 한다.
// 표 구분선의 정렬(:---, ---:, :---:)은 그대로 보존한다.

export type TableAlignment = 'default' | 'left' | 'center' | 'right';

export interface MarkdownTable {
  /** 본문에서 이 표가 시작하는 줄(0부터) */
  startLine: number;
  /** 본문에서 이 표가 끝나는 줄(0부터, 포함) */
  endLine: number;
  headers: string[];
  rows: string[][];
  alignments: TableAlignment[];
}

const tableRowPattern = /^\|.*\|$/;
const dividerCellPattern = /^:?-{3,}:?$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseAlignment(cell: string): TableAlignment {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'default';
}

function isDivider(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => dividerCellPattern.test(cell));
}

/** 본문에서 마크다운 표를 순서대로 찾는다. 표가 아닌 줄은 건드리지 않는다. */
function parseMarkdownTables(markdown: string): MarkdownTable[] {
  const lines = markdown.split('\n');
  const tables: MarkdownTable[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!tableRowPattern.test(lines[index].trim())) continue;
    if (!tableRowPattern.test(lines[index + 1].trim())) continue;
    const divider = splitRow(lines[index + 1]);
    if (!isDivider(divider)) continue;

    const headers = splitRow(lines[index]);
    const alignments = headers.map((_, column) => parseAlignment(divider[column] ?? '---'));
    const rows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length && tableRowPattern.test(lines[cursor].trim())) {
      const cells = splitRow(lines[cursor]);
      rows.push(headers.map((_, column) => cells[column] ?? ''));
      cursor += 1;
    }
    tables.push({ startLine: index, endLine: cursor - 1, headers, rows, alignments });
    index = cursor - 1;
  }
  return tables;
}

function alignmentCell(alignment: TableAlignment): string {
  if (alignment === 'left') return ':---';
  if (alignment === 'center') return ':---:';
  if (alignment === 'right') return '---:';
  return '---';
}

function serializeRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.trim()).join(' | ')} |`;
}

/** 표 하나를 마크다운 줄들로 바꾼다. */
function serializeTable(table: MarkdownTable): string[] {
  return [
    serializeRow(table.headers),
    serializeRow(table.alignments.map(alignmentCell)),
    ...table.rows.map(serializeRow),
  ];
}

/** 표를 포함한 본문을 편집 화면에서 다루기 위한 블록. */
export type MarkdownBlock =
  { kind: 'text'; lines: string[] } | { kind: 'table'; table: MarkdownTable };

/** 본문을 일반 텍스트 구간과 표 구간으로 나눈다. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  let cursor = 0;
  for (const table of parseMarkdownTables(markdown)) {
    if (table.startLine > cursor) {
      blocks.push({ kind: 'text', lines: lines.slice(cursor, table.startLine) });
    }
    blocks.push({ kind: 'table', table });
    cursor = table.endLine + 1;
  }
  if (cursor < lines.length) {
    blocks.push({ kind: 'text', lines: lines.slice(cursor) });
  }
  return blocks;
}

/** 나눈 블록을 다시 마크다운 본문으로 합친다. */
export function serializeMarkdownBlocks(blocks: MarkdownBlock[]): string {
  return blocks
    .flatMap((block) => (block.kind === 'text' ? block.lines : serializeTable(block.table)))
    .join('\n');
}

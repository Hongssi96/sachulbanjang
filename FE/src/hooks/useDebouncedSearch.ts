import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompositionEvent } from 'react';

/** 모든 검색창이 같은 지연 시간을 쓴다. 자연어 대화 입력창은 대상이 아니다. */
export const SEARCH_DEBOUNCE_MS = 300;

interface UseDebouncedSearchOptions {
  /** URL·외부 상태에 반영된 검색어. 뒤로 가기·초기화 시 입력창도 맞춘다. */
  value: string;
  onSearch: (value: string) => void;
  delay?: number;
}

/**
 * 검색 입력값을 즉시 보여 주고, 입력이 멈춘 뒤에만 검색을 실행한다.
 * 한글 조합 중에도 입력이 멈추면 조합 중인 문자열로 검색하고,
 * 지우기처럼 즉시 반영이 필요한 동작은 searchNow를 쓴다.
 */
export function useDebouncedSearch({
  value,
  onSearch,
  delay = SEARCH_DEBOUNCE_MS,
}: UseDebouncedSearchOptions) {
  const [input, setInput] = useState(value);
  // 조합 중에는 외부 값으로 입력을 덮어쓰지 않고, 조합이 끝나면 다시 동기화한다.
  const [composing, setComposing] = useState(false);
  const applied = useRef(value);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useEffect(() => {
    // 조합이 끝난 뒤 외부 값(URL 등)과 입력이 어긋나면 맞춘다.
    if (composing || value === applied.current) return;
    applied.current = value;
    setInput(value);
  }, [value, composing]);

  useEffect(() => {
    // 조합 중이어도 입력이 멈추면 현재 값으로 검색한다.
    if (input === applied.current) return;
    const timer = window.setTimeout(() => {
      applied.current = input;
      onSearchRef.current(input);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [input, delay]);

  const searchNow = useCallback((next: string) => {
    applied.current = next;
    setInput(next);
    onSearchRef.current(next);
  }, []);

  return {
    input,
    setInput,
    searchNow,
    compositionHandlers: {
      onCompositionStart: () => setComposing(true),
      onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
        setComposing(false);
        setInput(event.currentTarget.value);
      },
    },
  };
}

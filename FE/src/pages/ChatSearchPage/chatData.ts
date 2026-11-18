import {
  defaultQualityFilters,
  filterInspections,
  formatRate,
  qualityProducts,
  summarizeQuality,
} from '../../services/inspectionData';
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  href?: string;
  source?: string;
}
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
}
export const initialConversations: Conversation[] = [
  {
    id: 'quality',
    title: '최근 검사 불량률 확인',
    messages: [
      { role: 'user', text: '최근 7일 검사 결과를 알려줘' },
      {
        role: 'assistant',
        text: '2026.11.11–11.17 검사 기록은 2,480개입니다. 양품 2,420개, 불량 60개로 검사 불량률은 2.42%예요. 검사 표본 기준이며 전체 생산 불량률은 아닙니다.',
        href: '/quality-reports',
        source: '최근 7일 품질 리포트',
      },
    ],
  },
  {
    id: 'rg3',
    title: 'RG3 RH 검사 기록 찾기',
    messages: [
      { role: 'user', text: 'RG3 RH 검사 기록을 찾아줘' },
      {
        role: 'assistant',
        text: '최근 7일 RG3 RH 검사 660개 중 불량은 45개이며 검사 불량률은 6.82%예요. 상세 기록에서 배치별 결과를 확인할 수 있어요.',
        href: '/records?product=RG3+RH',
        source: 'RG3 RH 생산·검사 이력',
      },
    ],
  },
];
export function answerQuestion(question: string): ChatMessage {
  const normalized = question.toUpperCase().replaceAll(' ', '');
  const product = qualityProducts.find((item) => normalized.includes(item.replaceAll(' ', '')));
  if (product || /검사|불량|품질|생산량/.test(question)) {
    const summary = summarizeQuality(
      filterInspections({ ...defaultQualityFilters, product: product ?? '' }),
    );
    return {
      role: 'assistant',
      text: `2026.11.11–11.17 ${product ?? '전체 제품'}의 검사 수량은 ${summary.inspected.toLocaleString('ko-KR')}개, 양품 ${summary.passed.toLocaleString('ko-KR')}개, 불량 ${summary.defective}개입니다. 검사 불량률은 ${formatRate(summary.rate)}예요. 이 수치는 검사 표본 기준이며 불량 원인을 확정하지 않습니다.`,
      href: product ? `/records?product=${encodeURIComponent(product)}` : '/quality-reports',
      source: product ? `${product} 검사 기록` : '최근 7일 품질 리포트',
    };
  }
  if (/재고|입고|출고/.test(question))
    return {
      role: 'assistant',
      text: '재고 관리 화면에서 품목별 수량과 입출고 이력을 확인할 수 있어요. 이 대화에서는 실시간 재고 수치를 조회하지 않습니다.',
      href: '/inventory',
      source: '재고 관리',
    };
  return {
    role: 'assistant',
    text: '현재는 예시 검사 기록 조회를 체험할 수 있어요. “최근 검사 불량률 알려줘” 또는 “RG3 RH 검사 기록 찾아줘”처럼 질문해 주세요. 실제 AI 분석과 실시간 설비 조회는 아직 연결되지 않았습니다.',
  };
}
export const storageKey = 'sachul-chat-history-v1';
export function loadConversations(): Conversation[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (
      Array.isArray(stored) &&
      stored.length > 0 &&
      stored.every(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          Array.isArray(item.messages) &&
          item.messages.every(
            (message: ChatMessage) =>
              message &&
              ['user', 'assistant'].includes(message.role) &&
              typeof message.text === 'string' &&
              (message.href === undefined ||
                (typeof message.href === 'string' &&
                  /^\/(records|quality-reports|inventory)([/?]|$)/.test(message.href))) &&
              (message.source === undefined || typeof message.source === 'string'),
          ),
      )
    )
      return stored;
  } catch {
    /* unavailable or invalid storage uses example conversations */
  }
  return initialConversations;
}

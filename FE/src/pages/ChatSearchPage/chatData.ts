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

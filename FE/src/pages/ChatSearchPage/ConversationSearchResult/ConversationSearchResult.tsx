import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { fetchConversation } from '../../../api/conversations';
import type { ConversationListItem } from '../../../api/conversations';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { conversationPreview } from '../chatModel';
import { highlightMatches } from '../searchHighlight';
import './ConversationSearchResult.css';

interface ConversationSearchResultProps {
  conversation: ConversationListItem;
  query: string;
  onOpen: () => void;
}

export default function ConversationSearchResult({
  conversation,
  query,
  onOpen,
}: ConversationSearchResultProps) {
  const card = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = card.current;
    if (!element) return;
    // 검색 결과 전체를 한꺼번에 조회하지 않고 보이는 카드의 상세만 가져온다.
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { data, error } = useApiQuery(
    `chat-search-preview:${conversation.conversation_id}`,
    () => fetchConversation(conversation.conversation_id),
    { enabled: visible },
  );

  return (
    <button ref={card} type="button" className="cs-result cs-conversation-result" onClick={onOpen}>
      <MessageSquare size={18} />
      <div>
        <strong>{highlightMatches(conversation.title, query)}</strong>
        <p className="cs-conversation-preview">
          {error
            ? '미리보기를 불러오지 못했어요. 대화를 열어 확인해 주세요.'
            : data
              ? highlightMatches(conversationPreview(data.turns, query), query)
              : '대화 내용을 불러오는 중이에요…'}
        </p>
      </div>
    </button>
  );
}

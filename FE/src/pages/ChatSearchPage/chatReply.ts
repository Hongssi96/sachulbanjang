import {
  defaultQualityFilters,
  filterInspections,
  formatRate,
  qualityDateLabel,
  qualityProducts,
  summarizeQuality,
} from '../../services/inspectionData';
import type { ChatMessage } from './chatData';
export function answerQuestion(question: string): ChatMessage {
  const normalized = question.toUpperCase().replaceAll(' ', '');
  const product = qualityProducts.find((item) => normalized.includes(item.replaceAll(' ', '')));
  if (product || /검사|불량|품질|생산량/.test(question)) {
    const filters = { ...defaultQualityFilters, product: product ?? '' };
    const summary = summarizeQuality(filterInspections(filters));
    const range = `${qualityDateLabel(filters.from)}–${qualityDateLabel(filters.to)}`;
    return {
      role: 'assistant',
      text: `${range} ${product ?? '전체 제품'}의 검사 수량은 ${summary.inspected.toLocaleString('ko-KR')}개, 양품 ${summary.passed.toLocaleString('ko-KR')}개, 불량 ${summary.defective}개입니다. 검사 불량률은 ${formatRate(summary.rate)}예요. 이 수치는 검사 표본 기준이며 불량 원인을 확정하지 않습니다.`,
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

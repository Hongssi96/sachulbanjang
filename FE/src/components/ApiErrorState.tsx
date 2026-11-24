import { RotateCcw, TriangleAlert } from 'lucide-react';

interface ApiErrorStateProps {
  error: Error;
  onRetry?: () => void;
  compact?: boolean;
}

export default function ApiErrorState({ error, onRetry, compact = false }: ApiErrorStateProps) {
  return (
    <div className={`empty-state${compact ? ' is-compact' : ''}`} role="alert">
      <TriangleAlert size={compact ? 22 : 34} />
      <strong>데이터를 불러오지 못했어요</strong>
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="button button-white" onClick={onRetry}>
          <RotateCcw size={15} /> 다시 시도
        </button>
      )}
    </div>
  );
}

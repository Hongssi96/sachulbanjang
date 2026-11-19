import { LoaderCircle } from 'lucide-react';
import './LoadingState.css';
export default function LoadingState({
  label = '화면을 불러오는 중이에요',
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`loading-state ${compact ? 'is-compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <LoaderCircle size={compact ? 17 : 28} />
      <span>{label}</span>
      {!compact && (
        <div className="loading-skeleton" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}

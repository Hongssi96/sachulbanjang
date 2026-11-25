import { LoaderCircle } from 'lucide-react';
import './LoadingState.css';
export default function LoadingState({
  label = '화면을 불러오는 중이에요',
  compact = false,
  skeleton = true,
}: {
  label?: string;
  compact?: boolean;
  /** 큰 로딩에서 회색 막대(스켈레톤)를 함께 보여줄지 */
  skeleton?: boolean;
}) {
  return (
    <div
      className={`loading-state ${compact ? 'is-compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <LoaderCircle size={compact ? 17 : 28} />
      <span>{label}</span>
      {!compact && skeleton && (
        <div className="loading-skeleton" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}

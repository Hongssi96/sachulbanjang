import LoadingQualityWave from '../LoadingQualityWave/LoadingQualityWave';
import '../LoadingState.css';
import './AuthLoading.css';

export default function AuthLoading({
  label = '로그인 상태를 확인하는 중이에요',
}: {
  label?: string;
}) {
  return (
    <div className="loading-state is-auth" role="status" aria-live="polite">
      <LoadingQualityWave />
      <span>{label}</span>
    </div>
  );
}

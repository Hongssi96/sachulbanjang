import './HomeSectionSkeleton.css';

export default function HomeSectionSkeleton({ label }: { label: string }) {
  return (
    <div className="home-section-skeleton" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        <i />
        <i />
      </div>
    </div>
  );
}

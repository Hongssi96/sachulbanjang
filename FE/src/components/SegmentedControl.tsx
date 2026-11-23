import './SegmentedControl.css';

export type SegmentedDot = 'amber' | 'green' | 'violet';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  countTone?: 'warning';
  dot?: SegmentedDot;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'sm',
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`segmented segmented-${size}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        // 부모 카드의 클릭·키보드 동작으로 이벤트가 새지 않게 한다.
        event.stopPropagation();
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (current < 0) return;
        event.preventDefault();
        const offset = event.key === 'ArrowRight' ? 1 : buttons.length - 1;
        buttons[(current + offset) % buttons.length].focus();
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={active ? 'is-active' : ''}
            aria-pressed={active}
            onClick={(event) => {
              event.stopPropagation();
              onChange(option.value);
            }}
          >
            {option.dot && <i className={`seg-dot seg-dot-${option.dot}`} aria-hidden="true" />}
            {option.label}
            {option.count !== undefined && (
              <span className={`seg-count${option.countTone === 'warning' ? ' is-warning' : ''}`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

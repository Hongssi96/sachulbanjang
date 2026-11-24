import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './FilterSelect.css';
interface FilterSelectProps {
  id?: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  onChange: (value: string) => void;
}
export default function FilterSelect({
  id: triggerId,
  value,
  options,
  label,
  onChange,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState(264);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [highlight, setHighlight] = useState(selected);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector('.filter-select-options > .highlighted')
        ?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);
  // 열려 있는 동안 스크롤·크기 변경에 맞춰 위치를 다시 잡는다.
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // 목록이 잘리지 않도록, 모달 안이면 모달 경계까지의 여유 공간에 맞춰 방향과 높이를 정한다.
  const place = () => {
    const element = trigger.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const modal = element.closest('.modal');
    const boundsTop = modal ? modal.getBoundingClientRect().top : 0;
    const boundsBottom = modal
      ? Math.min(modal.getBoundingClientRect().bottom, window.innerHeight)
      : window.innerHeight;
    const spaceBelow = boundsBottom - rect.bottom;
    const spaceAbove = rect.top - boundsTop;
    const up = spaceBelow < Math.min(spaceAbove, 280);
    setDropUp(up);
    setMenuMaxHeight(Math.max(120, Math.min(264, (up ? spaceAbove : spaceBelow) - 8)));
  };
  const openMenu = () => {
    place();
    setOpen(true);
  };
  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div className="filter-select" ref={root}>
      <button
        id={triggerId}
        className="filter-select-trigger"
        type="button"
        ref={trigger}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${highlight}` : undefined}
        onClick={() => {
          setHighlight(selected);
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setHighlight(
              open ? (highlight + direction + options.length) % options.length : selected,
            );
            openMenu();
          } else if (event.key === 'Home' && open) {
            event.preventDefault();
            setHighlight(0);
          } else if (event.key === 'End' && open) {
            event.preventDefault();
            setHighlight(options.length - 1);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (open) choose(highlight);
            else {
              setHighlight(selected);
              openMenu();
            }
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === 'Tab') setOpen(false);
        }}
      >
        <span>{options[selected]?.label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          className={`filter-select-options${dropUp ? ' drop-up' : ''}`}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          style={{ maxHeight: menuMaxHeight }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={value === option.value}
              className={highlight === index ? 'highlighted' : ''}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                choose(index);
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={15} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

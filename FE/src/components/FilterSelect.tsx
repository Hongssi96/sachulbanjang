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
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setHighlight(
              open ? (highlight + direction + options.length) % options.length : selected,
            );
            setOpen(true);
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
              setOpen(true);
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
        <div className="filter-select-options" id={`${id}-list`} role="listbox" aria-label={label}>
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

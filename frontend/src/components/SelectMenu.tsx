import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
  searchText?: string;
}

interface RenderOptionState {
  active: boolean;
  selected: boolean;
}

export interface SelectMenuProps<T extends string | number> {
  value: T | null | undefined;
  options: Array<SelectOption<T>>;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  alignment?: 'left' | 'right';
  renderOption?: (option: SelectOption<T>, state: RenderOptionState) => ReactNode;
  renderValue?: (option?: SelectOption<T>) => ReactNode;
  onChange: (value: T) => void;
}

function getOptionIndex<T extends string | number>(
  options: Array<SelectOption<T>>,
  value: T | null | undefined,
) {
  if (value === null || typeof value === 'undefined') {
    return options.length > 0 ? 0 : -1;
  }

  return options.findIndex((option) => Object.is(option.value, value));
}

export function SelectMenu<T extends string | number>({
  value,
  options,
  placeholder = '请选择',
  emptyMessage = '暂无可选项',
  disabled = false,
  ariaLabel,
  className = '',
  buttonClassName = '',
  panelClassName = '',
  alignment = 'left',
  renderOption,
  renderValue,
  onChange,
}: SelectMenuProps<T>) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = useMemo(() => getOptionIndex(options, value), [options, value]);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const hasSelection =
    !!selectedOption &&
    !(typeof selectedOption.value === 'string' && selectedOption.value.trim().length === 0);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1);
      return;
    }

    setActiveIndex((current) => {
      if (current >= 0 && current < options.length) {
        return current;
      }
      return selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1;
    });
  }, [open, options, selectedIndex]);

  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }

    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const closeMenu = () => {
    setOpen(false);
  };

  const openMenu = () => {
    if (disabled || options.length === 0) {
      return;
    }

    setOpen(true);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  };

  const moveActiveIndex = (direction: 1 | -1) => {
    if (options.length === 0) {
      return;
    }

    setActiveIndex((current) => {
      if (current < 0) {
        return direction === 1 ? 0 : options.length - 1;
      }

      return (current + direction + options.length) % options.length;
    });
  };

  const handleSelect = (option: SelectOption<T>) => {
    onChange(option.value);
    closeMenu();
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      moveActiveIndex(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      moveActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }

      const option = activeIndex >= 0 ? options[activeIndex] : undefined;
      if (option) {
        handleSelect(option);
      }
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === 'Tab') {
      closeMenu();
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={`theme-select-trigger flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2 text-left text-[13px] transition-all ${buttonClassName}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            hasSelection ? 'text-ink' : 'text-ink3'
          }`}
        >
          {renderValue ? renderValue(selectedOption) : selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-ink3 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          strokeWidth={1.8}
        />
      </button>

      {open && (
        <div
          className={`theme-select-panel animate-dropdownRise absolute z-30 mt-2 w-full overflow-hidden rounded-[14px] border ${alignment === 'right' ? 'right-0' : 'left-0'} ${panelClassName}`}
        >
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-64 overflow-y-auto p-1.5"
          >
            {options.length === 0 ? (
              <div className="theme-select-empty px-3 py-5 text-center text-[12px]">
                {emptyMessage}
              </div>
            ) : (
              options.map((option, index) => {
                const selected = selectedIndex >= 0 && Object.is(options[selectedIndex].value, option.value);
                const active = index === activeIndex;

                return (
                  <button
                    key={`${option.value}`}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(option)}
                    className={`theme-select-option flex w-full items-start justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${
                      active ? 'theme-select-option-active' : ''
                    } ${selected ? 'theme-select-option-selected' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      {renderOption ? (
                        renderOption(option, { active, selected })
                      ) : (
                        <>
                          <span className="block truncate text-[13px] text-inherit">
                            {option.label}
                          </span>
                          {option.description && (
                            <span className="mt-0.5 block text-[11px] leading-[1.4] text-ink2">
                              {option.description}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    {selected && <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

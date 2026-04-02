import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

import type { SelectOption } from './SelectMenu';

interface ComboboxSelectProps<T extends string | number> {
  value: T | null | undefined;
  options: Array<SelectOption<T>>;
  featuredOptions?: Array<SelectOption<T>>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  filterFn?: (option: SelectOption<T>, query: string) => boolean;
  onChange: (value: T) => void;
}

function matchesQuery<T extends string | number>(option: SelectOption<T>, query: string) {
  const haystack = `${option.label} ${option.description || ''} ${option.searchText || ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function dedupeOptions<T extends string | number>(options: Array<SelectOption<T>>) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function ComboboxSelect<T extends string | number>({
  value,
  options,
  featuredOptions = [],
  placeholder = '请选择',
  searchPlaceholder = '搜索…',
  emptyMessage = '没有匹配的结果',
  disabled = false,
  ariaLabel,
  className = '',
  buttonClassName = '',
  panelClassName = '',
  filterFn = matchesQuery,
  onChange,
}: ComboboxSelectProps<T>) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((option) => Object.is(option.value, value)),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return dedupeOptions(options);
    }

    return dedupeOptions(options.filter((option) => filterFn(option, trimmedQuery)));
  }, [filterFn, options, query]);

  const featured = useMemo(() => {
    if (query.trim()) {
      return [] as Array<SelectOption<T>>;
    }

    return dedupeOptions(
      featuredOptions.filter((option) => options.some((item) => Object.is(item.value, option.value))),
    );
  }, [featuredOptions, options, query]);

  const featuredKeys = useMemo(() => new Set(featured.map((option) => `${option.value}`)), [featured]);
  const remainingOptions = useMemo(
    () => filteredOptions.filter((option) => !featuredKeys.has(`${option.value}`)),
    [featuredKeys, filteredOptions],
  );
  const visibleOptions = useMemo(() => [...featured, ...remainingOptions], [featured, remainingOptions]);
  const selectedIndex = useMemo(
    () => visibleOptions.findIndex((option) => Object.is(option.value, value)),
    [value, visibleOptions],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
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
      return;
    }

    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : visibleOptions.length > 0 ? 0 : -1);
      return;
    }

    setActiveIndex((current) => {
      if (current >= 0 && current < visibleOptions.length) {
        return current;
      }
      return selectedIndex >= 0 ? selectedIndex : visibleOptions.length > 0 ? 0 : -1;
    });
  }, [open, selectedIndex, visibleOptions]);

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
    if (disabled) {
      return;
    }

    setOpen(true);
  };

  const moveActiveIndex = (direction: 1 | -1) => {
    if (visibleOptions.length === 0) {
      return;
    }

    setActiveIndex((current) => {
      if (current < 0) {
        return direction === 1 ? 0 : visibleOptions.length - 1;
      }

      return (current + direction + visibleOptions.length) % visibleOptions.length;
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

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    }
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = activeIndex >= 0 ? visibleOptions[activeIndex] : undefined;
      if (option) {
        handleSelect(option);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
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
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? 'text-ink' : 'text-ink3'}`}>
          {selectedOption?.label || placeholder}
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
          className={`theme-select-panel animate-dropdownRise absolute left-0 z-30 mt-2 w-full overflow-hidden rounded-[14px] border ${panelClassName}`}
        >
          <div className="border-b border-border/50 px-3 py-2.5">
            <div className="theme-select-search flex items-center gap-2 rounded-[10px] border px-3 py-2">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-ink3" strokeWidth={1.8} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none placeholder:text-ink3"
              />
            </div>
          </div>

          <div id={listboxId} role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-y-auto p-1.5">
            {visibleOptions.length === 0 ? (
              <div className="theme-select-empty px-3 py-6 text-center text-[12px]">{emptyMessage}</div>
            ) : (
              <>
                {featured.length > 0 && (
                  <>
                    <div className="theme-select-section-label px-3 pb-1 pt-1 text-[10px] uppercase tracking-[0.12em]">
                      常用时区
                    </div>
                    {featured.map((option, index) => {
                      const selected = selectedIndex >= 0 && Object.is(visibleOptions[selectedIndex]?.value, option.value);
                      const active = activeIndex === index;

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
                          className={`theme-select-option flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${
                            active ? 'theme-select-option-active' : ''
                          } ${selected ? 'theme-select-option-selected' : ''}`}
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px] text-inherit">
                            {option.label}
                          </span>
                          {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />}
                        </button>
                      );
                    })}
                  </>
                )}

                {featured.length > 0 && remainingOptions.length > 0 && (
                  <div className="theme-select-section-label px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.12em]">
                    全部时区
                  </div>
                )}

                {remainingOptions.map((option, sectionIndex) => {
                  const index = featured.length + sectionIndex;
                  const selected = selectedIndex >= 0 && Object.is(visibleOptions[selectedIndex]?.value, option.value);
                  const active = activeIndex === index;

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
                      className={`theme-select-option flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${
                        active ? 'theme-select-option-active' : ''
                      } ${selected ? 'theme-select-option-selected' : ''}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] text-inherit">
                        {option.label}
                      </span>
                      {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

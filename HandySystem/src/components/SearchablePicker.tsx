import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { filterSearchOptions, hasExactSearchOption, type SearchOption } from "../lib/search";

interface SearchablePickerProps {
  label: string;
  value: string;
  options: SearchOption[];
  placeholder: string;
  noResults: string;
  onChange: (value: string) => void;
  createAction?: string;
  onCreate?: (query: string) => void;
  createDisabled?: boolean;
  createDisabledHint?: string;
}

export function SearchablePicker({
  label,
  value,
  options,
  placeholder,
  noResults,
  onChange,
  createAction,
  onCreate,
  createDisabled = false,
  createDisabledHint,
}: SearchablePickerProps) {
  const inputId = useId();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => filterSearchOptions(options, query), [options, query]);
  const shouldOfferCreate = Boolean(onCreate && createAction && query.trim() && !hasExactSearchOption(options, query));
  const canCreate = shouldOfferCreate && !createDisabled;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function choose(option: SearchOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
    setActiveIndex(0);
  }

  function createFromQuery() {
    if (!canCreate || !onCreate) return;
    const valueToCreate = query.trim();
    onCreate(valueToCreate);
    setQuery(valueToCreate);
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      const lastIndex = filtered.length + (canCreate ? 1 : 0) - 1;
      setActiveIndex((index) => Math.min(index + 1, Math.max(lastIndex, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      if (filtered[activeIndex]) {
        event.preventDefault();
        choose(filtered[activeIndex]);
      } else if (canCreate && activeIndex === filtered.length) {
        event.preventDefault();
        createFromQuery();
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(selected?.label ?? "");
    }
  }

  return (
    <div className="field-group searchable-picker" ref={rootRef}>
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && (filtered[activeIndex] || canCreate && activeIndex === filtered.length)
            ? `${listId}-${canCreate && activeIndex === filtered.length ? "create" : activeIndex}`
            : undefined}
          className="form-input h-12 pr-10 pl-9 text-sm"
          value={open ? query : selected?.label ?? ""}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            setQuery("");
            setActiveIndex(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
            onChange("");
          }}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear selection"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
          ><X size={14} /></button>
        ) : <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
        {open && (
          <div id={listId} role="listbox" aria-label={label} className="picker-options absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
            {filtered.length === 0 && !shouldOfferCreate && <div className="px-3 py-3 text-xs text-slate-400">{noResults}</div>}
            {filtered.map((option, index) => (
              <div
                id={`${listId}-${index}`}
                key={option.value}
                role="option"
                aria-selected={value === option.value}
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition ${activeIndex === index ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-700">{option.label}</span>{option.detail && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{option.detail}</span>}</span>
                {value === option.value && <Check size={15} className="shrink-0 text-indigo-600" />}
              </div>
            ))}
            {shouldOfferCreate && <>
              {filtered.length > 0 && <div className="mx-2 my-1 border-t border-slate-100" />}
              {canCreate ? <div
                id={`${listId}-create`}
                role="option"
                aria-selected={activeIndex === filtered.length}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-indigo-700 ${activeIndex === filtered.length ? "bg-indigo-50" : "hover:bg-indigo-50"}`}
                onMouseEnter={() => setActiveIndex(filtered.length)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={createFromQuery}
              ><Plus size={15} className="shrink-0" /><span className="min-w-0 truncate">{createAction}: “{query.trim()}”</span></div> : <div className="px-3 py-2 text-[11px] leading-relaxed text-slate-400">{createDisabledHint}</div>}
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

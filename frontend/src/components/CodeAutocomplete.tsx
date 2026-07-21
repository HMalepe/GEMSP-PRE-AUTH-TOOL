import { useEffect, useRef, useState } from 'react';

export interface CodeAutocompleteProps<T> {
  id: string;
  label: string;
  placeholder?: string;
  search: (query: string) => Promise<T[]>;
  getCode: (item: T) => string;
  getLabel: (item: T) => string;
  onSelect: (item: T | null) => void;
  initialText?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Every coded field (ICD-10, tariff, NAPPI, provider) autocompletes
 * against reference data — no free-text code entry (Implementation
 * Companion §C.2). Typing filters a dropdown; only clicking or
 * Enter-selecting a suggestion counts as a valid value. Anything else
 * left in the box on blur is flagged inline and treated as unselected,
 * which is what "no free-text" actually means in practice here — the
 * field can't be submitted with a string nobody validated.
 */
export function CodeAutocomplete<T>({
  id,
  label,
  placeholder,
  search,
  getCode,
  getLabel,
  onSelect,
  initialText,
  required,
  disabled,
}: CodeAutocompleteProps<T>) {
  const [text, setText] = useState(initialText ?? '');
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [selected, setSelected] = useState<T | null>(null);
  const [touched, setTouched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (selected && getLabel(selected) === text) {
      return;
    }
    if (text.trim().length === 0) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(text)
        .then((results) => {
          setSuggestions(results);
          setOpen(results.length > 0);
          setHighlighted(0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        });
    }, 200);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function choose(item: T) {
    setSelected(item);
    setText(getLabel(item));
    setOpen(false);
    onSelect(item);
  }

  function handleBlur() {
    setTouched(true);
    setOpen(false);
    if (!selected || getLabel(selected) !== text) {
      if (text.trim().length > 0) {
        setSelected(null);
        onSelect(null);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = suggestions[highlighted];
      if (item) {
        choose(item);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const invalid = touched && required && text.trim().length > 0 && !selected;

  return (
    <div className="field autocomplete">
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          setSelected(null);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={invalid ? 'invalid' : undefined}
      />
      {open && (
        <ul className="autocomplete-list" role="listbox">
          {suggestions.map((item, i) => (
            <li
              key={getCode(item)}
              role="option"
              aria-selected={i === highlighted}
              className={i === highlighted ? 'highlighted' : undefined}
              // onMouseDown (not onClick) fires before the input's onBlur, so the selection registers.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
            >
              {getLabel(item)}
            </li>
          ))}
        </ul>
      )}
      {invalid && <p className="field-error">Not recognized — pick a value from the list.</p>}
    </div>
  );
}

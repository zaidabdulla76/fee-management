import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

export function matchesStudent(student, term) {
  if (!term) return true;
  const t = term.toLowerCase();
  return [student.name, student.phone, student.student_code, student.class, student.father_name]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(t));
}

function studentLabel(student) {
  return `${student.student_code} — ${student.name} (Class ${student.class})`;
}

export function StudentSearch({
  students = [],
  value = '',
  onChange,
  label = 'Find student',
  placeholder = 'Type a name, phone, ID, or class…',
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const deferredQuery = useDeferredValue(query.trim());

  const selected = useMemo(
    () => students.find((s) => s.id === value) || null,
    [students, value]
  );

  const matches = useMemo(() => {
    const list = students.filter((s) => matchesStudent(s, deferredQuery));
    return list.slice(0, 30);
  }, [students, deferredQuery]);

  useEffect(() => {
    setHighlight(0);
  }, [deferredQuery, open]);

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(student) {
    onChange(student.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && matches[highlight]) pick(matches[highlight]);
      else if (matches.length === 1) pick(matches[0]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    }
  }

  return (
    <div ref={wrapRef} className="block text-sm">
      <label htmlFor="f-find-student" className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
      </label>

      {selected ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-accent/25 bg-accent-soft px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-primary">{selected.name}</p>
            <p className="truncate text-xs text-muted">
              {selected.student_code} · Class {selected.class}
              {selected.phone ? ` · ${selected.phone}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-accent hover:underline"
            onClick={clear}
            disabled={disabled}
          >
            Change
          </button>
        </div>
      ) : null}

      <div className="relative">
        <input
          ref={inputRef}
          id="f-find-student"
          role="combobox"
          aria-expanded={open}
          aria-controls="student-search-list"
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={selected ? 'Search to pick a different student…' : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="relative z-[1] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-slate-50 disabled:text-muted"
        />

        {open && !disabled ? (
          <ul
            id="student-search-list"
            role="listbox"
            className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-white py-1 shadow-lg"
          >
            {!students.length ? (
              <li className="px-3 py-2 text-sm text-muted">No active students yet.</li>
            ) : !matches.length ? (
              <li className="px-3 py-2 text-sm text-muted">
                No match for “{query.trim()}”. Try name, phone, ID, or class.
              </li>
            ) : (
              matches.map((s, index) => (
                <li key={s.id} role="option" aria-selected={s.id === value || index === highlight}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                      index === highlight ? 'bg-accent-soft text-primary' : 'hover:bg-slate-50'
                    }`}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted">{studentLabel(s)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

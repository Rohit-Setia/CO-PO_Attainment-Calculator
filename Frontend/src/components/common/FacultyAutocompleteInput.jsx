import { useEffect, useState, useRef } from 'react';
import { Search, Loader2, Check, X, User } from 'lucide-react';
import { searchFacultyUsers } from '../../Api/AttainmentApi';

/**
 * Gmail-style Faculty Autocomplete Input
 * Allows searching active faculty users by name, email, or employee ID.
 * Shows suggestions in an interactive popover with keyboard navigation.
 */
export default function FacultyAutocompleteInput({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Search by name, email, or ID…',
  required = false,
  disabled = false,
  className = '',
  autoFocus = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerSearch = (query) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    setShowDropdown(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await searchFacultyUsers(trimmed);
        const data = res.data?.data || [];
        setSuggestions(data);
        setHighlightedIndex(data.length > 0 ? 0 : -1);
      } catch (err) {
        setSuggestions([]);
        setHighlightedIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    onChange?.(val);
    triggerSearch(val);
  };

  const handleSelect = (user) => {
    onChange?.(user.email);
    onSelect?.(user);
    setShowDropdown(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleClear = () => {
    onChange?.('');
    setSuggestions([]);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value && value.trim().length > 0) {
              triggerSearch(value);
            }
          }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          className={`w-full rounded-xl border border-border bg-background py-2 pl-9 pr-8 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Gmail-style Autocomplete Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-md">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Searching faculty directory…
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No faculty found matching &ldquo;{value}&rdquo;
            </div>
          ) : (
            suggestions.map((user, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isSelected = value.toLowerCase() === user.email.toLowerCase();
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelect(user)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition ${
                    isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-primary/20 to-primary/10 font-bold text-primary shadow-sm">
                    {user.name ? user.name.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-foreground truncate">{user.name}</span>
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {user.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/75 truncate mt-0.5">
                      {user.employee_id && <span>ID: {user.employee_id}</span>}
                      {user.employee_id && user.department_name && <span>•</span>}
                      {user.department_name && <span className="truncate">{user.department_name}</span>}
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

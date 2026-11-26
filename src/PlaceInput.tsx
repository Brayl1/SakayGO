import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import type { Place } from "../shared/trip-types";
export default function PlaceInput({
  id,
  label,
  value,
  onChange,
  onPick,
  searchQuery,
}: {
  id: string;
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  onPick: () => void;
  searchQuery?: { text: string; version: number };
}) {
  const [text, setText] = useState(value?.label || ""),
    [options, setOptions] = useState<Place[]>([]),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef(false);

  useEffect(() => {
    if (editing.current) {
      editing.current = false;
      return;
    }
    setText(value?.label || "");
    if (value) {
      setOptions([]);
      setOpen(false);
      setError("");
    }
  }, [value]);
  useEffect(() => {
    if (searchQuery?.text) {
      setText(searchQuery.text);
      setOptions([]);
      setError("");
      setOpen(true);
      input.current?.focus();
    }
  }, [searchQuery]);
  useEffect(() => {
    if (!open || text.length < 3 || value) return;
    const cancel = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          "/api/places?q=" + encodeURIComponent(text),
          { signal: cancel.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (cancel.signal.aborted) return;
        setOptions(data.places);
        setActive(0);
      } catch (e) {
        if (!cancel.signal.aborted)
          setError(
            (e as Error).message || "Place search failed. Pick a map point.",
          );
      } finally {
        if (!cancel.signal.aborted) setLoading(false);
      }
    }, 650);
    return () => {
      clearTimeout(timer);
      cancel.abort();
    };
  }, [text, open, value]);
  function change(next: string) {
    editing.current = !!value;
    setText(next);
    setOptions([]);
    setOpen(true);
    setError("");
    onChange(null);
    const parts = next.split(",").map(Number);
    if (
      parts.length === 2 &&
      parts[0] >= 8.1 &&
      parts[0] <= 8.8 &&
      parts[1] >= 124.2 &&
      parts[1] <= 125
    )
      onChange({
        label: next,
        point: [parts[0], parts[1]],
        source: "User-entered coordinates",
      });
  }
  function choose(p: Place) {
    onChange(p);
    setOpen(false);
    setOptions([]);
  }
  return (
    <div className="place-field">
      <label htmlFor={id}>{label}</label>
      <div>
        <MapPin size={17} />
        <input
          id={id}
          ref={input}
          value={text}
          placeholder="Search a place or enter lat, lng"
          role="combobox"
          aria-controls={`${id}-options`}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[active] ? `${id}-option-${active}` : undefined
          }
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
              setOpen(true);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            }
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && open && options[active]) {
              e.preventDefault();
              choose(options[active]);
            }
          }}
        />
        {text && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              onChange(null);
              setText("");
              setOptions([]);
              input.current?.focus();
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>
      <button className="pick-location" type="button" onClick={onPick}>
        Choose {label.toLowerCase()} on map
      </button>
      {open && text.length >= 3 && !value && (
        <div className="place-options">
          <ul id={`${id}-options`} role="listbox">
            {options.map((p, i) => (
              <li
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={active === i}
                key={p.label + i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <strong>{p.label}</strong>
                <small>{p.source} · not a verified stop</small>
              </li>
            ))}
          </ul>
          {loading ? (
            <p role="status">Searching places…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            !options.length && (
              <p>No places found. Choose a point on the map.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}


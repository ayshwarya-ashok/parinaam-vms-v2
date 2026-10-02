import { useEffect, useState } from 'react';

/**
 * Live search without the flicker (Round 41): the input stays perfectly
 * responsive, but the value the QUERY sees only settles after the typing
 * pauses — so a seven-letter search fires one request, not seven. Pairs with
 * `placeholderData: (prev) => prev` on the query, which keeps the previous
 * rows on screen while the new ones load instead of blanking the table.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

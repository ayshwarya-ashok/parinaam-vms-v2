import { TableCell, TableSortLabel } from '@mui/material';
import type { TableCellProps } from '@mui/material';
import { useMemo, useState } from 'react';

/** null is a real state: the third click restores the list's natural order. */
export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  key: string | null;
  direction: SortDirection;
}

/** Pull the comparable value out of a row. Return null for "no value". */
export type SortAccessor<T> = (row: T) => string | number | Date | boolean | null | undefined;

/**
 * Sorting for a table, in three states: ascending → descending → none.
 *
 * The third state matters. Many of these tables arrive in an order the server
 * chose deliberately — waitlist position, newest registration first, sessions
 * by date — and a two-state toggle would leave no way back to it once a column
 * is clicked.
 *
 * Sorting is client-side over the rows already on screen; where a table is
 * paginated server-side, that is the honest scope — it sorts this page.
 */
export function useTableSort<T>(
  rows: T[] | undefined,
  accessors: Record<string, SortAccessor<T>>,
) {
  const [sort, setSort] = useState<SortState>({ key: null, direction: null });

  const toggle = (key: string) =>
    setSort((current) => {
      if (current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      if (current.direction === 'desc') return { key: null, direction: null };
      return { key, direction: 'asc' };
    });

  const sorted = useMemo(() => {
    const list = rows ?? [];
    if (!sort.key || !sort.direction) return list;
    const accessor = accessors[sort.key];
    if (!accessor) return list;

    const factor = sort.direction === 'asc' ? 1 : -1;
    // Copy first: sorting the array in place would mutate the query cache.
    return [...list].sort((a, b) => factor * compare(accessor(a), accessor(b)));
    // accessors is a literal rebuilt each render; keying on it would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort.key, sort.direction]);

  return { sorted, sort, toggle };
}

/** Empty values sort last in BOTH directions — a blank is not "smallest". */
function compare(
  a: string | number | Date | boolean | null | undefined,
  b: string | number | Date | boolean | null | undefined,
): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

interface SortableCellProps extends Omit<TableCellProps, 'onClick'> {
  /** Key into the accessor map passed to useTableSort. */
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  children: React.ReactNode;
}

/** A column header that cycles ascending → descending → unsorted. */
export function SortableCell({
  sortKey,
  sort,
  onSort,
  children,
  ...cellProps
}: SortableCellProps) {
  const active = sort.key === sortKey && sort.direction !== null;
  return (
    <TableCell
      {...cellProps}
      sortDirection={active ? (sort.direction as 'asc' | 'desc') : false}
    >
      <TableSortLabel
        active={active}
        direction={active ? (sort.direction as 'asc' | 'desc') : 'asc'}
        onClick={() => onSort(sortKey)}
        sx={{ fontWeight: 'inherit' }}
      >
        {children}
      </TableSortLabel>
    </TableCell>
  );
}

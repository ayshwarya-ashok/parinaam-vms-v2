import FilterAltIcon from '@mui/icons-material/FilterAlt';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Popover,
  TableCell,
  TableSortLabel,
  Typography,
} from '@mui/material';
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

/** Blanks are a filterable value too — they surface under this label. */
export const FILTER_BLANK = '—';

export interface ColumnFilter {
  /** Distinct values, in display order. */
  values: string[];
  /** Currently ticked values; empty means "no filter". */
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Column filters, Excel-style (Round 39): every value a column actually holds
 * becomes a checkbox in its funnel dropdown — the lists are derived from the
 * data on screen, never hardcoded. An empty selection means "show everything".
 */
export function useColumnFilters<T>(
  rows: T[] | undefined,
  accessors: Record<string, (row: T) => string | null | undefined>,
) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const values = useMemo(() => {
    const list = rows ?? [];
    const out: Record<string, string[]> = {};
    for (const [key, accessor] of Object.entries(accessors)) {
      const set = new Set<string>();
      for (const row of list) set.add(accessor(row) || FILTER_BLANK);
      out[key] = [...set].sort((a, b) =>
        a === FILTER_BLANK ? 1 : b === FILTER_BLANK ? -1 : a.localeCompare(b, 'en', { numeric: true }),
      );
    }
    return out;
    // accessors is a literal rebuilt each render; keying on it would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const active = Object.entries(selected).filter(([, sel]) => sel.length > 0);
    if (active.length === 0) return list;
    return list.filter((row) =>
      active.every(([key, sel]) => sel.includes(accessors[key]?.(row) || FILTER_BLANK)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selected]);

  const filterFor = (key: string): ColumnFilter => ({
    values: values[key] ?? [],
    selected: selected[key] ?? [],
    onChange: (next) => setSelected((s) => ({ ...s, [key]: next })),
  });

  const clearAll = () => setSelected({});
  const anyActive = Object.values(selected).some((sel) => sel.length > 0);

  return { filtered, filterFor, clearAll, anyActive };
}

/** The funnel beside a column's sort control: multi-select over its values. */
function ColumnFilterButton({ filter, label }: { filter: ColumnFilter; label: React.ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = filter.selected.length > 0;

  const toggleValue = (value: string) =>
    filter.onChange(
      filter.selected.includes(value)
        ? filter.selected.filter((v) => v !== value)
        : [...filter.selected, value],
    );

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Filter ${typeof label === 'string' ? label : 'column'}`}
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
        sx={{ p: 0.25, ml: 0.25, color: active ? 'primary.main' : 'rgba(31,43,54,0.35)' }}
      >
        {active ? <FilterAltIcon sx={{ fontSize: 16 }} /> : <FilterAltOutlinedIcon sx={{ fontSize: 16 }} />}
      </IconButton>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { borderRadius: 2, p: 1, minWidth: 180, maxHeight: 320 } } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {filter.values.map((value) => (
            <FormControlLabel
              key={value}
              sx={{ mx: 0, '& .MuiTypography-root': { fontSize: '0.85rem' } }}
              control={
                <Checkbox
                  size="small"
                  sx={{ py: 0.4 }}
                  checked={filter.selected.includes(value)}
                  onChange={() => toggleValue(value)}
                />
              }
              label={value}
            />
          ))}
          {filter.values.length === 0 && (
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', px: 1, py: 0.5 }}>
              Nothing to filter yet.
            </Typography>
          )}
          <Button
            size="small"
            disabled={!active}
            onClick={() => { filter.onChange([]); setAnchor(null); }}
            sx={{ alignSelf: 'flex-start', textTransform: 'none', mt: 0.5 }}
          >
            Clear filter
          </Button>
        </Box>
      </Popover>
    </>
  );
}

interface SortableCellProps extends Omit<TableCellProps, 'onClick'> {
  /** Key into the accessor map passed to useTableSort. */
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  /** Optional funnel: a multi-select over the column's distinct values. */
  filter?: ColumnFilter;
  children: React.ReactNode;
}

/** A column header that cycles ascending → descending → unsorted. */
export function SortableCell({
  sortKey,
  sort,
  onSort,
  filter,
  children,
  ...cellProps
}: SortableCellProps) {
  const active = sort.key === sortKey && sort.direction !== null;
  return (
    <TableCell
      {...cellProps}
      sortDirection={active ? (sort.direction as 'asc' | 'desc') : false}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
        <TableSortLabel
          active={active}
          direction={active ? (sort.direction as 'asc' | 'desc') : 'asc'}
          onClick={() => onSort(sortKey)}
          sx={{ fontWeight: 'inherit' }}
        >
          {children}
        </TableSortLabel>
        {filter && <ColumnFilterButton filter={filter} label={children} />}
      </Box>
    </TableCell>
  );
}

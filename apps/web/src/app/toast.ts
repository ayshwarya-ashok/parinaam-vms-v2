import { useSnackbar } from 'notistack';
import { useCallback, useMemo } from 'react';
import { asApiError } from '@/api/client';

/**
 * The three things a save can tell you, said the same way everywhere.
 *
 * `noChanges` exists because "nothing happened" is a distinct outcome from
 * "it worked": a form submitted untouched used to flash the same green
 * confirmation as a real edit, which quietly teaches people that the message
 * means nothing.
 *
 * `failure` takes the error itself rather than a string, so an API error's own
 * message (which is written for the person reading it) survives instead of
 * being replaced by a generic one at every call site.
 */
export function useToast() {
  const { enqueueSnackbar } = useSnackbar();

  const success = useCallback(
    (message: string) => enqueueSnackbar(message, { variant: 'success' }),
    [enqueueSnackbar],
  );

  const failure = useCallback(
    (error: unknown, fallback = 'Something went wrong. Please try again.') =>
      enqueueSnackbar(
        typeof error === 'string' ? error : (asApiError(error)?.message ?? fallback),
        { variant: 'error' },
      ),
    [enqueueSnackbar],
  );

  const noChanges = useCallback(
    (message = 'No changes to save.') => enqueueSnackbar(message, { variant: 'info' }),
    [enqueueSnackbar],
  );

  const warn = useCallback(
    (message: string) => enqueueSnackbar(message, { variant: 'warning' }),
    [enqueueSnackbar],
  );

  return useMemo(
    () => ({ success, failure, noChanges, warn }),
    [success, failure, noChanges, warn],
  );
}

/**
 * Shallow comparison against the values a form started with.
 * Everything is compared as trimmed strings — a form's state is strings, and
 * `"3"` from an input must not read as a change against `3` from the API.
 */
export function isUnchanged<T extends Record<string, unknown>>(current: T, original: T): boolean {
  return Object.keys(current).every((key) => {
    const a = current[key];
    const b = original[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => String(v) === String(b[i]));
    }
    return String(a ?? '').trim() === String(b ?? '').trim();
  });
}

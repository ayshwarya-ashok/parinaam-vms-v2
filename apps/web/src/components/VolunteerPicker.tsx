import { Autocomplete, Box, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/api/client';

export interface PickerVolunteer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  category?: string;
  phase?: string;
}

interface VolunteerPickerProps {
  value: PickerVolunteer | null;
  onChange: (volunteer: PickerVolunteer | null) => void;
  /** Volunteers to hide — e.g. everyone already on the roster. */
  excludeIds?: Set<string>;
  label?: string;
  helperText?: string;
  autoFocus?: boolean;
}

/**
 * Type-ahead volunteer search for staff flows (enroll on behalf, walk-ins).
 * Replaces the scroll-a-hundred-rows select: the search runs SERVER-side
 * (name, email or phone — the same matching the directory uses), debounced,
 * limited to approved volunteers, with the roster's people filtered out.
 */
export function VolunteerPicker({
  value,
  onChange,
  excludeIds,
  label = 'Volunteer',
  helperText,
  autoFocus,
}: VolunteerPickerProps) {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ['volunteer-picker', debounced],
    queryFn: async () =>
      (
        await api.get<{ data: PickerVolunteer[] }>('/volunteers', {
          params: { registrationStatus: 'approved', q: debounced || undefined, limit: 20 },
        })
      ).data.data,
    placeholderData: (prev) => prev,
  });

  const options = (data ?? []).filter((v) => !excludeIds?.has(v.id));

  return (
    <Autocomplete
      value={value}
      onChange={(_, v) => onChange(v)}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      options={options}
      // The server already searched; re-filtering locally would fight it.
      filterOptions={(x) => x}
      getOptionLabel={(v) => `${v.firstName} ${v.lastName}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={isFetching}
      noOptionsText={
        debounced
          ? 'No matching approved volunteers (people already on this roster are hidden)'
          : 'Type a name, email or phone number…'
      }
      renderOption={(props, v) => (
        <Box component="li" {...props} key={v.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {v.firstName} {v.lastName}
            </Typography>
            <Typography noWrap sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
              {v.email}
            </Typography>
          </Box>
          {v.category && <Chip label={v.category} size="small" variant="outlined" sx={{ flexShrink: 0 }} />}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          autoFocus={autoFocus}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isFetching ? <CircularProgress size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}

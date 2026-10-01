import { Autocomplete, TextField } from '@mui/material';
import { useState } from 'react';
import { CITIES_BY_STATE, INDIA_STATES, OTHER_CITY, cityOptions } from '@/app/india-locations';

interface StateCityFieldsProps {
  state: string;
  city: string;
  onStateChange: (state: string) => void;
  onCityChange: (city: string) => void;
  stateError?: string;
  cityError?: string;
  size?: 'small' | 'medium';
  /** Extra element rendered in the same grid slot sequence (the Others field appears after city). */
}

/**
 * Cascading State → City selection for India (Round 36): both are type-to-
 * filter dropdowns, the city list unlocks once a state is chosen, and the
 * city list always ends in "Others" — choosing it reveals a free-text field
 * whose value is what actually gets stored as the city.
 *
 * Renders two or three fields as siblings, so the parent's grid/stack places
 * them like any other inputs.
 */
export function StateCityFields({
  state,
  city,
  onStateChange,
  onCityChange,
  stateError,
  cityError,
  size = 'medium',
}: StateCityFieldsProps) {
  // "Others" mode survives from the moment it is picked until the state
  // changes or a listed city is chosen — the free text must not snap back to
  // the dropdown while the person is still typing their town's name.
  const knownCity = state !== '' && (CITIES_BY_STATE[state] ?? []).includes(city);
  const [othersPicked, setOthersPicked] = useState(false);
  const othersMode = othersPicked || (city !== '' && !knownCity);

  return (
    <>
      <Autocomplete
        options={INDIA_STATES}
        value={state || null}
        onChange={(_, v) => {
          onStateChange(v ?? '');
          onCityChange('');
          setOthersPicked(false);
        }}
        size={size}
        renderInput={(params) => (
          <TextField
            {...params}
            label="State"
            required
            error={Boolean(stateError)}
            helperText={stateError}
            autoComplete="address-level1"
          />
        )}
      />
      <Autocomplete
        options={cityOptions(state)}
        disabled={!state}
        value={othersMode ? OTHER_CITY : city || null}
        onChange={(_, v) => {
          if (v === OTHER_CITY) {
            setOthersPicked(true);
            onCityChange('');
          } else {
            setOthersPicked(false);
            onCityChange(v ?? '');
          }
        }}
        size={size}
        renderInput={(params) => (
          <TextField
            {...params}
            label="City"
            required
            error={Boolean(cityError) && !othersMode}
            helperText={
              !state
                ? 'Choose a state first'
                : (!othersMode ? cityError : undefined)
            }
            autoComplete="address-level2"
          />
        )}
      />
      {othersMode && (
        <TextField
          label="City name"
          required
          size={size}
          value={city}
          error={Boolean(cityError)}
          helperText={cityError ?? 'Your city is not on the list — type its name'}
          onChange={(e) => onCityChange(e.target.value)}
        />
      )}
    </>
  );
}

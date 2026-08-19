import SearchIcon from '@mui/icons-material/Search';
import { Box, Chip, InputAdornment, Paper, TextField, Typography } from '@mui/material';

export interface ChipGroup {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  groups?: ChipGroup[];
}

/** The prototype's filter bar: a search input plus labelled chip groups. */
export function FilterBar({ search, groups = [] }: FilterBarProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        gap: 1.5,
        flexWrap: 'wrap',
        alignItems: 'center',
        p: 1.5,
        mb: 2.5,
        borderRadius: 3,
        bgcolor: 'rgba(255,255,255,0.6)',
      }}
    >
      {search && (
        <TextField
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder ?? 'Search…'}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            sx: { borderRadius: 999 },
          }}
          sx={{ minWidth: 200 }}
        />
      )}
      {groups.map((group) => (
        <Box key={group.label} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              mr: 0.5,
            }}
          >
            {group.label}
          </Typography>
          {group.options.map((option) => {
            const active = group.value === option.value;
            return (
              <Chip
                key={option.value}
                label={option.label}
                size="small"
                variant={active ? 'filled' : 'outlined'}
                onClick={() => group.onChange(option.value)}
                sx={
                  active
                    ? {
                        bgcolor: 'primary.main',
                        color: '#fff',
                        '&:hover': { bgcolor: 'primary.dark' },
                      }
                    : undefined
                }
              />
            );
          })}
        </Box>
      ))}
    </Paper>
  );
}

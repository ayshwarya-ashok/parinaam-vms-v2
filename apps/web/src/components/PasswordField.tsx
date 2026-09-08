import { useEffect, useRef, useState } from 'react';
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

/** The reveal is a peek, not a mode: it re-masks itself after this long. */
const REVEAL_MS = 2000;

/**
 * A password TextField with a show/hide eye. The toggle never steals focus
 * from the input (onMouseDown preventDefault), so a typo can be checked
 * mid-typing, and a reveal auto-hides after two seconds so a password is
 * never left readable on a shared or projected screen. Every other
 * TextField prop passes straight through.
 */
export function PasswordField(props: TextFieldProps) {
  const [show, setShow] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (show) {
      hideTimer.current = setTimeout(() => setShow(false), REVEAL_MS);
    }
    return () => clearTimeout(hideTimer.current);
  }, [show]);

  return (
    <TextField
      {...props}
      type={show ? 'text' : 'password'}
      InputProps={{
        ...props.InputProps,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow((s) => !s)}
              onMouseDown={(e) => e.preventDefault()}
              edge="end"
              size="small"
            >
              {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

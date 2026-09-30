import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { fetchCertificateBlob } from '@/api/recognition';

interface CertificatePreviewDialogProps {
  /** The certificate to preview; null keeps the dialog closed. */
  certificateId: string | null;
  title?: string;
  onClose: () => void;
}

/**
 * In-app certificate preview: the PDF renders inline (the browser's viewer,
 * via a blob URL that never leaves the page) with Download right there — no
 * detour through the downloads folder just to see what was issued. Shared by
 * the volunteer wallet and the admin certificates table.
 */
export function CertificatePreviewDialog({ certificateId, title, onClose }: CertificatePreviewDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState('certificate.pdf');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!certificateId) return undefined;
    let revoked: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    fetchCertificateBlob(certificateId)
      .then(({ blob, filename: name }) => {
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
        setFilename(name);
      })
      .catch(() => !cancelled && setError('Could not load the certificate.'));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [certificateId]);

  const download = () => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  return (
    <Dialog open={certificateId !== null} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{title ?? 'Certificate preview'}</DialogTitle>
      <DialogContent sx={{ p: 0, height: '72vh', display: 'flex' }}>
        {error ? (
          <Alert severity="error" sx={{ m: 3, borderRadius: 3, alignSelf: 'flex-start' }}>
            {error}
          </Alert>
        ) : url ? (
          // The full native viewer, toolbar and thumbnails included. Its own
          // download icon cannot be individually removed (the viewer is a
          // browser-internal frame; #toolbar only toggles ALL of it) — but a
          // toolbar save names the file after the blob GUID, so the dialog's
          // Download button below remains the one that gives the real filename.
          <Box
            component="iframe"
            src={url}
            title={title ?? 'Certificate preview'}
            sx={{ border: 0, width: '100%', height: '100%' }}
          />
        ) : (
          <Box sx={{ display: 'grid', placeItems: 'center', width: '100%' }}>
            <CircularProgress color="secondary" />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="pillOutlined" onClick={onClose}>
          Close
        </Button>
        <Button variant="pill" disabled={!url} onClick={download}>
          ⬇ Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { Box, CircularProgress } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fetchCertificateBlob } from '@/api/recognition';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * A real thumbnail of the issued PDF (Round 48): the first page rendered
 * into a canvas with pdf.js, fetched through the authenticated client. The
 * render happens once per certificate id and only when the card is on screen.
 */
export function CertificateThumbnail({
  certificateId,
  width = 180,
  onClick,
}: {
  certificateId: string;
  width?: number;
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      const { blob } = await fetchCertificateBlob(certificateId);
      const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
      const page = await doc.getPage(1);
      if (cancelled || !canvasRef.current) return;
      const scale = (width / page.getViewport({ scale: 1 }).width) * window.devicePixelRatio;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
      canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      if (!cancelled) setState('ready');
      void doc.destroy();
    })().catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [certificateId, width]);

  return (
    <Box
      onClick={onClick}
      sx={{
        width,
        aspectRatio: '792 / 612',
        borderRadius: 1.5,
        border: '1px solid rgba(31,43,54,0.15)',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        bgcolor: '#fff',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      {state === 'loading' && <CircularProgress size={18} color="secondary" />}
      {state === 'error' && (
        <Box sx={{ fontSize: '1.6rem' }} aria-label="certificate">🏆</Box>
      )}
      <canvas ref={canvasRef} style={{ display: state === 'ready' ? 'block' : 'none' }} />
    </Box>
  );
}

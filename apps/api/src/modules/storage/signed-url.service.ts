import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../../config';

const DEFAULT_TTL_MINUTES = 60 * 24; // long enough for outbox sweep retries

/**
 * Capability URLs for machine-to-machine file access.
 *
 * n8n fetches email attachments over the container network with no session,
 * so the URL itself must carry the authorization: an HMAC over path+expiry,
 * keyed with LINK_TOKEN_SECRET. Possession of an unexpired signed URL for one
 * specific path grants exactly that path and nothing else.
 */
@Injectable()
export class SignedUrlService {
  constructor(private readonly config: AppConfig) {}

  private hmac(path: string, exp: number): string {
    return createHmac('sha256', this.config.get('LINK_TOKEN_SECRET'))
      .update(`file:${path}:${exp}`)
      .digest('base64url');
  }

  /**
   * Internal (container-network) URL, e.g. for n8n attachment fetches.
   * `name` sets the served filename (Content-Disposition) — n8n names the
   * email attachment after it. It is display-only, so it sits outside the
   * signature: tampering renames the file, never grants access.
   */
  internalUrl(path: string, name?: string, ttlMinutes = DEFAULT_TTL_MINUTES): string {
    const exp = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
    const sig = this.hmac(path, exp);
    const base = this.config.get('INTERNAL_API_URL');
    const namePart = name ? `&name=${encodeURIComponent(name)}` : '';
    return `${base}/files/signed?path=${encodeURIComponent(path)}&exp=${exp}&sig=${sig}${namePart}`;
  }

  /** Browser-reachable variant of the same capability URL (public gallery). */
  publicUrl(path: string, name?: string, ttlMinutes = DEFAULT_TTL_MINUTES): string {
    const internal = this.internalUrl(path, name, ttlMinutes);
    return internal.replace(this.config.get('INTERNAL_API_URL'), this.config.get('PUBLIC_API_URL'));
  }

  verify(path: string, exp: number, sig: string): boolean {
    if (!path || !exp || !sig) return false;
    if (exp < Math.floor(Date.now() / 1000)) return false;

    const expected = Buffer.from(this.hmac(path, exp), 'utf8');
    const provided = Buffer.from(sig, 'utf8');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }
}

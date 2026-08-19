import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Structural UUID check. Postgres accepts any 128-bit uuid regardless of RFC
 * version, and the deterministic demo-seed ids are "version 0" — Nest's
 * ParseUUIDPipe and class-validator's IsUUID reject those on the version
 * nibble, which is stricter than the database we are guarding.
 */
@Injectable()
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException('Invalid id format');
    }
    return value.toLowerCase();
  }
}

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const SCRYPT_VERSION = '1';
const SCRYPT_N = 65_536;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: n, r, p, maxmem: SCRYPT_MAX_MEMORY },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await derive(password, salt);

    return [
      'scrypt',
      SCRYPT_VERSION,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const [algorithm, version, nText, rText, pText, saltText, hashText] = encoded.split('$');
    const n = Number(nText);
    const r = Number(rText);
    const p = Number(pText);

    if (
      algorithm !== 'scrypt' ||
      version !== SCRYPT_VERSION ||
      n !== SCRYPT_N ||
      r !== SCRYPT_R ||
      p !== SCRYPT_P ||
      !saltText ||
      !hashText
    ) {
      return false;
    }

    try {
      const expected = Buffer.from(hashText, 'base64url');
      const actual = await derive(password, Buffer.from(saltText, 'base64url'), n, r, p);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  async consumeDummyVerification(password: string): Promise<void> {
    await derive(password, Buffer.alloc(16));
  }
}

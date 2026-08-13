// Super-admin password hashing (PBKDF2-SHA256 via WebCrypto).
//
// Scope note, deliberately stated in code as well as in the README: this gates
// the editing UI, it is not a security boundary. The catalog is published to
// every teammate's browser, so the hash travels with it and anyone determined
// enough can bypass the check locally. Use it to stop accidental edits, and
// keep real secrets out of the catalog.

const encoder = new TextEncoder();

function toBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password, iterations = 250000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return {
    passwordHash: toBase64(hash),
    salt: toBase64(salt),
    iterations
  };
}

export async function verifyPassword(password, credential) {
  if (!credential || !credential.passwordHash || !credential.salt) return false;
  const expected = fromBase64(credential.passwordHash);
  const actual = await derive(password, fromBase64(credential.salt), credential.iterations);
  if (expected.length !== actual.length) return false;

  // Constant-time-ish compare. Cheap to do, no reason not to.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { HttpError } from './http.js';
import { properCase } from './names.js';

/*
 * "Continue with Google": the browser gets an ID token (a JWT signed by
 * Google) from Google's sign-in button and posts it here. It is trusted only
 * after checking its signature against Google's published keys, that it was
 * issued by Google, for this app's client ID, and is not expired. No client
 * secret is involved in this flow.
 */

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let cache = { keys: new Map(), expires: 0 };

/** Google's signing keys by key id, cached for as long as Google says. */
async function signingKeys() {
  if (Date.now() < cache.expires && cache.keys.size) return cache.keys;
  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new HttpError(502, 'Could not reach Google to check the sign-in. Try again.');
  const { keys } = await response.json();
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cache = {
    keys: new Map(keys.map((jwk) => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })])),
    expires: Date.now() + Math.min(maxAge, 24 * 3600) * 1000,
  };
  return cache.keys;
}

/** The verified identity: { googleId, email, name, picture }. Throws 401 when the token is not good. */
export async function verifyGoogleIdToken(idToken) {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(404, 'Google sign-in is not set up on this server.');
  const decoded = jwt.decode(String(idToken ?? ''), { complete: true });
  if (!decoded?.header?.kid) throw new HttpError(401, 'That Google sign-in could not be read. Try again.');

  let key = (await signingKeys()).get(decoded.header.kid);
  if (!key) {
    // Google rotates keys; fetch once more before giving up.
    cache.expires = 0;
    key = (await signingKeys()).get(decoded.header.kid);
  }
  if (!key) throw new HttpError(401, 'That Google sign-in could not be checked. Try again.');

  let claims;
  try {
    claims = jwt.verify(idToken, key, { algorithms: ['RS256'], audience: env.GOOGLE_CLIENT_ID, issuer: ISSUERS });
  } catch {
    throw new HttpError(401, 'That Google sign-in has expired or is not for MediThink. Try again.');
  }
  if (!claims.email || claims.email_verified !== true) {
    throw new HttpError(401, 'Your Google account needs a verified email to sign in.');
  }
  return {
    googleId: String(claims.sub),
    email: String(claims.email).toLowerCase(),
    name: properCase(claims.name || claims.given_name || claims.email.split('@')[0]).slice(0, 60),
    picture: String(claims.picture || ''),
  };
}

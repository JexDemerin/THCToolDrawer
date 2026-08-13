// Talking to the Apps Script web app.
//
// Every call runs from the service worker. The extension declares host
// permission for script.google.com, which means these requests are not subject
// to CORS — no preflight, no headers to negotiate. POST bodies go out as
// text/plain because Apps Script reads the raw body regardless of type, and
// text/plain avoids a preflight in any context that does enforce CORS.

const TIMEOUT_MS = 20000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function request(url, options) {
  if (!url) throw new Error('No spreadsheet connection is set up yet.');

  const timeout = withTimeout();
  let response;
  try {
    response = await fetch(url, { ...options, signal: timeout.signal, redirect: 'follow' });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The spreadsheet took too long to answer.');
    throw new Error('Could not reach the spreadsheet. Check the connection and your network.');
  } finally {
    timeout.done();
  }

  if (!response.ok) {
    throw new Error(`The spreadsheet answered with HTTP ${response.status}.`);
  }

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    // An HTML body here almost always means the deployment is set to require
    // sign-in, so Google served a login page instead of the script's output.
    throw new Error(
      'The spreadsheet returned a sign-in page rather than data. Re-deploy the ' +
        'Apps Script with access set to "Anyone".'
    );
  }

  if (payload && payload.ok === false) throw new Error(payload.error || 'The script reported an error.');
  return payload;
}

function post(endpoint, body) {
  return request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
}

export function fetchCatalog(endpoint) {
  const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}action=catalog`;
  return request(url, { method: 'GET' });
}

export function verifyPassword(endpoint, password) {
  return post(endpoint, { action: 'verify', password });
}

export function saveCatalog(endpoint, password, catalog) {
  return post(endpoint, { action: 'save', password, catalog });
}

export function ping(endpoint) {
  return post(endpoint, { action: 'ping' });
}

/** The URL Apps Script hands you when you deploy a web app. */
export function looksLikeEndpoint(url) {
  return /^https:\/\/script\.google\.com\/.+\/exec\b/.test(String(url || '').trim());
}

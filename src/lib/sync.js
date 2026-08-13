// Pulling the catalog from wherever it is published, and pushing it back.
//
// The pull side is what makes the drawer maintainable: teammates never
// reinstall, they just receive whatever the admin last published.

import { normalizeConfig, configForPublish } from './config.js';
import { getConfig, setConfig, getSync, getMeta, setMeta, getPublish } from './storage.js';

/**
 * Fetch the published catalog and adopt it when it is newer than what we hold.
 *
 * @returns {Promise<{status: string, version?: number, error?: string}>}
 *   status is one of: 'not-configured' | 'updated' | 'current' | 'held' | 'error'
 */
export async function pullRemoteConfig({ force = false } = {}) {
  const sync = await getSync();
  const url = (sync.configUrl || '').trim();

  if (!url) {
    await setMeta({ lastSyncError: null });
    return { status: 'not-configured' };
  }

  let remote;
  try {
    const response = await fetch(url, { cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    remote = normalizeConfig(await response.json());
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    await setMeta({ lastSyncAt: Date.now(), lastSyncError: message });
    return { status: 'error', error: message };
  }

  const local = await getConfig();
  const meta = await getMeta();
  const firstEverSync = meta.lastRemoteVersion === null;
  const isNewer = remote.version > local.version;

  // Unpublished admin edits are never silently overwritten. The drawer surfaces
  // the conflict instead, and the admin picks publish-mine or discard-mine.
  if (meta.dirty && !force) {
    const conflict = isNewer ? remote.version : null;
    await setMeta({
      lastSyncAt: Date.now(),
      lastSyncError: null,
      lastRemoteVersion: remote.version,
      pendingRemoteVersion: conflict
    });
    return { status: 'held', version: remote.version };
  }

  if (!firstEverSync && !isNewer && !force) {
    await setMeta({
      lastSyncAt: Date.now(),
      lastSyncError: null,
      lastRemoteVersion: remote.version
    });
    return { status: 'current', version: remote.version };
  }

  await setConfig(remote);
  await setMeta({
    lastSyncAt: Date.now(),
    lastSyncError: null,
    lastRemoteVersion: remote.version,
    pendingRemoteVersion: null,
    dirty: false
  });
  return { status: 'updated', version: remote.version };
}

/**
 * Push the local catalog to the configured destination.
 *
 * 'manual' returns the JSON for the admin to download and host themselves;
 * 'gist' and 'http' write it straight out so teammates pick it up on their next
 * poll.
 */
export async function publishConfig({ editor } = {}) {
  const publish = await getPublish();
  const config = configForPublish(await getConfig(), editor);
  const json = JSON.stringify(config, null, 2);

  if (publish.target === 'manual') {
    await setConfig(config);
    return { status: 'manual', json, version: config.version };
  }

  if (publish.target === 'gist') {
    const id = (publish.gist.id || '').trim();
    const token = (publish.gist.token || '').trim();
    const filename = (publish.gist.filename || 'thc-tool-drawer.json').trim();
    if (!id || !token) {
      return { status: 'error', error: 'Gist publishing needs both a gist ID and a token.' };
    }

    const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: { [filename]: { content: json } } })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        status: 'error',
        error: `Gist update failed (HTTP ${response.status}). ${detail.slice(0, 200)}`
      };
    }

    await setConfig(config);
    await setMeta({ dirty: false, pendingRemoteVersion: null, lastRemoteVersion: config.version });
    return { status: 'published', version: config.version };
  }

  // Generic endpoint: whatever host serves the catalog to the team.
  const url = (publish.http.url || '').trim();
  if (!url) return { status: 'error', error: 'No publish URL is set.' };

  const headers = { 'Content-Type': 'application/json' };
  if (publish.http.headerName && publish.http.headerValue) {
    headers[publish.http.headerName] = publish.http.headerValue;
  }

  const response = await fetch(url, {
    method: publish.http.method || 'PUT',
    headers,
    body: json
  });

  if (!response.ok) {
    return { status: 'error', error: `Publish failed (HTTP ${response.status}).` };
  }

  await setConfig(config);
  await setMeta({ dirty: false, pendingRemoteVersion: null, lastRemoteVersion: config.version });
  return { status: 'published', version: config.version };
}

// Injects the drawer into every allowed page.
//
// The whole UI lives inside a closed shadow root, and the panel itself is an
// iframe pointing at an extension page. That buys two things: the host page's
// CSS can never reach the drawer, and the drawer runs in a real extension
// context so it can talk to chrome.* directly.
//
// Content scripts cannot use ES modules, so the handful of shared strings below
// are repeated from src/lib/constants.js.

(() => {
  const MOUNT_FLAG = '__thcToolDrawerMounted';
  if (window[MOUNT_FLAG]) return;
  window[MOUNT_FLAG] = true;

  const MSG = {
    TOGGLE_DRAWER: 'TD_TOGGLE_DRAWER',
    GET_MOUNT_STATE: 'TD_GET_MOUNT_STATE',
    SET_UI: 'TD_SET_UI'
  };
  const FRAME_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const MIN_WIDTH = 260;
  const MAX_WIDTH = 620;

  let host = null;
  let shadow = null;
  let panel = null;
  let handle = null;
  let frame = null;
  let state = { open: false, pinned: false, width: 340, side: 'right' };

  init();

  async function init() {
    const mountState = await send({ type: MSG.GET_MOUNT_STATE });
    if (!mountState || !mountState.ok || !mountState.shouldMount) return;

    state = {
      open: Boolean(mountState.ui.pinned),
      pinned: Boolean(mountState.ui.pinned),
      width: clamp(mountState.ui.width, MIN_WIDTH, MAX_WIDTH),
      side: mountState.side === 'left' ? 'left' : 'right',
      handleTop: mountState.ui.handleTop || 140,
      handleLabel: mountState.handleLabel || 'Tools',
      accent: mountState.accent || '#0d7c74'
    };

    build();
    // A pinned drawer starts open, which means the panel has to be loaded, not
    // just slid into view.
    if (state.open) setOpen(true);
    else applyState();
  }

  function build() {
    host = document.createElement('div');
    host.id = 'thc-tool-drawer-host';
    // A page can still remove this node, but nothing here relies on the page
    // leaving it alone beyond ordinary good behaviour.
    host.style.cssText = 'all: initial; position: static;';
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.appendChild(styleElement());

    panel = document.createElement('div');
    panel.className = `td-panel td-${state.side}`;

    const grip = document.createElement('div');
    grip.className = 'td-grip';
    grip.title = 'Drag to resize';
    grip.addEventListener('mousedown', startResize);

    // The iframe stays empty until the drawer is first opened. This script runs
    // on every page the teammate visits, and loading the panel eagerly would
    // mean paying for it everywhere it is never used.
    frame = document.createElement('iframe');
    frame.className = 'td-frame';
    frame.setAttribute('title', 'THC Tool Drawer');

    panel.append(grip, frame);

    handle = document.createElement('button');
    handle.className = `td-handle td-${state.side}`;
    handle.type = 'button';
    handle.style.top = `${state.handleTop}px`;
    handle.style.setProperty('--td-accent', state.accent);
    handle.setAttribute('aria-label', 'Toggle THC Tool Drawer');
    handle.innerHTML = `<span class="td-handle-dot"></span><span class="td-handle-text">${escapeHtml(
      state.handleLabel
    )}</span>`;
    handle.addEventListener('click', () => setOpen(!state.open));

    shadow.append(handle, panel);
    (document.body || document.documentElement).appendChild(host);
  }

  function styleElement() {
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }

      .td-panel {
        position: fixed;
        top: 0;
        bottom: 0;
        width: ${state.width}px;
        z-index: 2147483646;
        display: flex;
        background: #ffffff;
        box-shadow: 0 0 28px rgba(15, 23, 42, 0.22);
        transition: transform 180ms ease;
        will-change: transform;
      }
      .td-panel.td-right { right: 0; transform: translateX(100%); }
      .td-panel.td-left  { left: 0;  transform: translateX(-100%); flex-direction: row-reverse; }
      .td-panel.td-open  { transform: translateX(0); }

      .td-frame { flex: 1; border: 0; width: 100%; height: 100%; display: block; }

      .td-grip {
        width: 6px;
        cursor: col-resize;
        background: transparent;
        flex: 0 0 6px;
      }
      .td-grip:hover { background: rgba(13, 124, 116, 0.35); }

      .td-handle {
        position: fixed;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border: 0;
        cursor: pointer;
        font: 600 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #ffffff;
        background: var(--td-accent, #0d7c74);
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.28);
        /* Slides along with the panel as it opens and closes. */
        transition: right 180ms ease, left 180ms ease, filter 120ms ease;
        writing-mode: vertical-rl;
      }
      .td-handle:hover { filter: brightness(1.08); }
      .td-handle.td-right { right: 0; border-radius: 8px 0 0 8px; }
      .td-handle.td-left  { left: 0;  border-radius: 0 8px 8px 0; }

      .td-handle-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.85);
      }

      @media (prefers-color-scheme: dark) {
        .td-panel { background: #10161d; }
      }
    `;
    return style;
  }

  function applyState() {
    panel.classList.toggle('td-open', state.open);
    panel.style.width = `${state.width}px`;
    const offset = state.open ? state.width : 0;
    handle.style[state.side] = `${offset}px`;
  }

  function setOpen(open) {
    state.open = open;
    applyState();
    if (open) {
      loadFrame().then(() => {
        // Let the drawer refresh itself each time it comes into view. Waiting
        // for load matters on the very first open, when there is no document in
        // the iframe yet to receive the message.
        postToFrame({ type: 'opened' });
        frame.focus();
      });
    }
    send({ type: MSG.SET_UI, patch: { open } });
  }

  let framePromise = null;
  function loadFrame() {
    if (framePromise) return framePromise;
    framePromise = new Promise((resolve) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.src = chrome.runtime.getURL('src/drawer/drawer.html');
    });
    return framePromise;
  }

  // --- resize -------------------------------------------------------------

  function startResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.width;

    const onMove = (moveEvent) => {
      const delta =
        state.side === 'right' ? startX - moveEvent.clientX : moveEvent.clientX - startX;
      state.width = clamp(startWidth + delta, MIN_WIDTH, MAX_WIDTH);
      applyState();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      send({ type: MSG.SET_UI, patch: { width: state.width } });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // --- plumbing -----------------------------------------------------------

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== MSG.TOGGLE_DRAWER) return;
    if (!host) return;
    setOpen(!state.open);
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== FRAME_ORIGIN) return;
    const data = event.data;
    if (!data || data.source !== 'thc-tool-drawer') return;

    if (data.type === 'close') setOpen(false);
    if (data.type === 'pinned') state.pinned = Boolean(data.pinned);
    if (data.type === 'accent' && typeof data.accent === 'string') {
      handle.style.setProperty('--td-accent', data.accent);
    }
    if (data.type === 'label' && typeof data.label === 'string') {
      const text = handle.querySelector('.td-handle-text');
      if (text) text.textContent = data.label;
    }
  });

  function postToFrame(payload) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ source: 'thc-tool-drawer-host', ...payload }, FRAME_ORIGIN);
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          void chrome.runtime.lastError;
          resolve(response);
        });
      } catch {
        resolve(null); // extension reloaded out from under this page
      }
    });
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    );
  }
})();

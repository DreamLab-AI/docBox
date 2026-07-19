/*
 * docBox chat bubble (M7) — one dependency-free IIFE, no build step. Renders a
 * floating button and chat panel that POSTs { prompt } to `${base}/api/chat` as
 * JSON (no SSE Accept header, so server streaming can land without touching
 * embeds) and shows { reply } or { error }. `base` is the script tag's
 * data-docbox-url, else its own http(s) origin, else same-origin relative.
 * Only global left behind: window.docBoxBubble = { open, close }.
 */
(function () {
  'use strict';

  if (window.docBoxBubble) return; // guard double-inclusion
  var api = {};
  window.docBoxBubble = api;

  // Resolve the control-plane base URL
  var self = document.currentScript;
  var base = '';
  if (self) {
    var attr = self.getAttribute('data-docbox-url');
    if (attr) {
      base = attr.replace(/\/+$/, '');
    } else if (self.src) {
      try {
        var origin = new URL(self.src).origin;
        if (origin.indexOf('http') === 0) base = origin; // ignore file:// / null
      } catch (e) { /* leave base = '' → same-origin relative */ }
    }
  }
  var CHAT_URL = base + '/api/chat';

  // Palette (dark / light, chosen from prefers-color-scheme)
  var DARK = {
    accent: '#5b8cff', userBubble: '#3a5fb0', agentBubble: '#232a39',
    panelBg: '#121620', headerBg: '#1a1f2b', inputBg: '#1a1f2b',
    text: '#eef2f8', muted: '#868f9f', line: '#2c3444',
    errBg: 'rgba(240,89,107,0.12)', errFg: '#f0596b',
    shadow: '0 10px 40px rgba(0,0,0,0.5)'
  };
  var LIGHT = {
    accent: '#3a5fb0', userBubble: '#5b8cff', agentBubble: '#eef2f8',
    panelBg: '#ffffff', headerBg: '#f4f6fb', inputBg: '#ffffff',
    text: '#1a1f2b', muted: '#5b6472', line: '#dfe4ee',
    errBg: 'rgba(197,45,61,0.10)', errFg: '#c52d3d',
    shadow: '0 10px 40px rgba(20,30,60,0.22)'
  };
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function palette() { return (mq && mq.matches) || !mq ? DARK : LIGHT; }
  var pal = palette();

  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

  // Tiny DOM helpers
  function css(el, o) { for (var k in o) if (o.hasOwnProperty(k)) el.style[k] = o[k]; }
  function mk(tag, style, attrs) {
    var el = document.createElement(tag);
    if (style) css(el, style);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
    return el;
  }

  // Elements captured for theming.
  var root, btn, panel, header, title, caption, closeBtn, list, footer, ta, sendBtn;
  var isOpen = false, pending = false;

  function build() {
    root = mk('div', {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483000',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
      gap: '12px', fontFamily: FONT
    });

    // Panel (rendered above the button; hidden until opened).
    panel = mk('div', {
      display: 'none', flexDirection: 'column', overflow: 'hidden',
      width: 'min(360px, calc(100vw - 40px))',
      height: 'min(480px, calc(100vh - 120px))',
      borderRadius: '14px', boxSizing: 'border-box', fontSize: '14px'
    }, {
      role: 'dialog', 'aria-modal': 'false', 'aria-label': 'docBox agent chat',
      id: 'docbox-bubble-panel'
    });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });

    // Header: title + honest caption, and a close button.
    header = mk('div', {
      display: 'flex', alignItems: 'flex-start', gap: '8px',
      padding: '12px 14px', flex: '0 0 auto'
    });
    var htext = mk('div', { flex: '1 1 auto', minWidth: '0' });
    title = mk('div', { fontWeight: '600', fontSize: '14px' });
    title.textContent = 'docBox agent';
    caption = mk('div', { fontSize: '11px', marginTop: '2px', lineHeight: '1.35' });
    // Honest about what answers: the deterministic mock engine unless the box
    // is started with DOCBOX_ENGINE=live.
    caption.textContent = "Replies come from the box's engine — mock by default.";
    htext.appendChild(title);
    htext.appendChild(caption);

    closeBtn = mk('button', {
      appearance: 'none', border: 'none', background: 'transparent',
      cursor: 'pointer', fontSize: '20px', lineHeight: '1', padding: '2px 4px',
      flex: '0 0 auto', borderRadius: '6px'
    }, { type: 'button', 'aria-label': 'Close chat' });
    closeBtn.textContent = '×'; // ×
    closeBtn.addEventListener('click', close);

    header.appendChild(htext);
    header.appendChild(closeBtn);

    // Messages log.
    list = mk('div', {
      flex: '1 1 auto', overflowY: 'auto', padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: '8px'
    }, { role: 'log', 'aria-live': 'polite', 'aria-atomic': 'false', 'aria-label': 'Conversation' });

    // Footer: textarea + send.
    footer = mk('form', {
      display: 'flex', gap: '8px', alignItems: 'flex-end',
      padding: '10px 12px', flex: '0 0 auto'
    });
    footer.addEventListener('submit', function (e) { e.preventDefault(); send(); });

    ta = mk('textarea', {
      flex: '1 1 auto', resize: 'none', maxHeight: '96px', minHeight: '38px',
      padding: '9px 10px', borderRadius: '10px', fontFamily: FONT, fontSize: '14px',
      lineHeight: '1.4', boxSizing: 'border-box', outline: 'none'
    }, { rows: '1', 'aria-label': 'Message', placeholder: 'Ask about your documents…' });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    sendBtn = mk('button', {
      appearance: 'none', border: 'none', cursor: 'pointer', flex: '0 0 auto',
      padding: '9px 14px', borderRadius: '10px', fontWeight: '600', fontSize: '14px',
      fontFamily: FONT
    }, { type: 'submit', 'aria-label': 'Send message' });
    sendBtn.textContent = 'Send';

    footer.appendChild(ta);
    footer.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(footer);

    // Floating button.
    btn = mk('button', {
      appearance: 'none', border: 'none', cursor: 'pointer',
      width: '56px', height: '56px', borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '24px', lineHeight: '1', padding: '0'
    }, {
      type: 'button', 'aria-label': 'Open docBox chat', 'aria-haspopup': 'dialog',
      'aria-expanded': 'false', 'aria-controls': 'docbox-bubble-panel'
    });
    // ⌘-ish docBox glyph.
    btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"' +
      ' stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
      ' stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M7.5 4.5A2.5 2.5 0 1 0 10 7v10a2.5 2.5 0 1 1-2.5 2.5"></path>' +
      '<path d="M16.5 4.5A2.5 2.5 0 1 1 14 7v10a2.5 2.5 0 1 0 2.5 2.5"></path>' +
      '<rect x="7" y="7" width="10" height="10" rx="2"></rect></svg>';
    btn.addEventListener('click', toggle);

    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);

    intro();
    applyTheme();

    api.open = open;
    api.close = close;
  }

  // Messages
  function addMsg(role, text) {
    var row = mk('div', {
      display: 'flex',
      justifyContent: role === 'user' ? 'flex-end' : 'flex-start'
    });
    var bubble = mk('div', {
      maxWidth: '82%', padding: '8px 11px', borderRadius: '13px',
      fontSize: '14px', lineHeight: '1.45', whiteSpace: 'pre-wrap',
      wordBreak: 'break-word', boxSizing: 'border-box'
    }, { 'data-role': role });
    bubble.textContent = text;
    row.appendChild(bubble);
    list.appendChild(row);
    paintBubble(bubble);
    scrollDown();
    return bubble;
  }
  function setMsg(bubble, text, isError) {
    bubble.textContent = text;
    if (isError) bubble.setAttribute('data-role', 'error');
    paintBubble(bubble);
    scrollDown();
  }
  function scrollDown() { list.scrollTop = list.scrollHeight; }

  function intro() {
    addMsg('agent', 'Hello — ask me about the documents in this box.');
  }

  // Send flow
  function send() {
    var text = ta.value.trim();
    if (!text || pending) return;
    ta.value = '';
    addMsg('user', text);
    pending = true;
    sendBtn.disabled = true;
    ta.setAttribute('aria-busy', 'true');
    var wait = addMsg('agent', '…');
    fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: text })
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, error: 'The server returned a non-JSON response (' + res.status + ').' };
      });
    }).then(function (data) {
      if (data && data.ok && typeof data.reply === 'string') {
        setMsg(wait, data.reply);
      } else {
        setMsg(wait, (data && data.error) || 'The agent could not answer.', true);
      }
    }).catch(function () {
      setMsg(wait, 'Could not reach the docBox server.', true);
    }).then(function () {
      pending = false;
      sendBtn.disabled = false;
      ta.removeAttribute('aria-busy');
      ta.focus();
    });
  }

  // Open / close
  function open() {
    if (isOpen) return;
    isOpen = true;
    css(panel, { display: 'flex' });
    btn.setAttribute('aria-expanded', 'true');
    ta.focus();
    scrollDown();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    css(panel, { display: 'none' });
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  }
  function toggle() { if (isOpen) close(); else open(); }

  // Theming
  function paintBubble(b) {
    var r = b.getAttribute('data-role');
    if (r === 'user') css(b, { background: pal.userBubble, color: '#ffffff', border: '0' });
    else if (r === 'error') css(b, { background: pal.errBg, color: pal.errFg, border: '1px solid ' + pal.errFg });
    else css(b, { background: pal.agentBubble, color: pal.text, border: '0' });
  }
  function applyTheme() {
    pal = palette();
    css(btn, { background: pal.accent, color: '#ffffff', boxShadow: pal.shadow });
    css(panel, { background: pal.panelBg, color: pal.text, border: '1px solid ' + pal.line, boxShadow: pal.shadow });
    css(header, { background: pal.headerBg, borderBottom: '1px solid ' + pal.line });
    css(title, { color: pal.text });
    css(caption, { color: pal.muted });
    css(closeBtn, { color: pal.muted });
    css(list, { background: pal.panelBg });
    css(footer, { background: pal.headerBg, borderTop: '1px solid ' + pal.line });
    css(ta, { background: pal.inputBg, color: pal.text, border: '1px solid ' + pal.line });
    css(sendBtn, { background: pal.accent, color: '#ffffff' });
    for (var i = 0; i < list.children.length; i++) {
      var bubble = list.children[i].firstChild;
      if (bubble) paintBubble(bubble);
    }
  }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    else if (mq.addListener) mq.addListener(applyTheme);
  }

  // Boot when the body exists
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();

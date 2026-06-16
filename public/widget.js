/**
 * Maya Restaurant AI Chat Widget
 * Drop this onto any website with one <script> tag:
 *
 *   <script
 *     src="https://your-domain.com/widget.js"
 *     data-restaurant="maple-table-001"
 *     data-name="The Maple Table"
 *     data-color="#92400e"
 *     data-position="right"
 *   ></script>
 */
(function () {
  'use strict';

  const script = document.currentScript;
  const restaurantId = script?.getAttribute('data-restaurant') || 'taqueria_el_coral_santa_teresa';
  const restaurantName = script?.getAttribute('data-name') || 'Our Restaurant';
  const primaryColor = script?.getAttribute('data-color') || '#92400e';
  const position = script?.getAttribute('data-position') || 'right';
  const apiBase = script?.src ? new URL(script.src).origin : window.location.origin;

  // ── Session ID (persisted per browser) ──────────────────────────────────────
  const SESSION_KEY = `maya_session_${restaurantId}`;
  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, id); }
    return id;
  }
  const sessionId = getSessionId();

  // ── Conversation history ─────────────────────────────────────────────────────
  const HISTORY_KEY = `maya_history_${restaurantId}`;
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-40))); } catch {}
  }
  let history = loadHistory();

  // ── Styles ──────────────────────────────────────────────────────────────────
  const css = `
    #maya-widget-btn {
      position: fixed; bottom: 24px; ${position}: 24px; z-index: 99998;
      width: 60px; height: 60px; border-radius: 50%;
      background: ${primaryColor}; color: #fff; border: none; cursor: pointer;
      font-size: 26px; box-shadow: 0 4px 20px rgba(0,0,0,.25);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s;
    }
    #maya-widget-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,.3); }
    #maya-widget-btn .maya-badge {
      position: absolute; top: -4px; right: -4px;
      background: #ef4444; color: #fff; font-size: 11px; font-weight: 700;
      width: 20px; height: 20px; border-radius: 50%; display: none;
      align-items: center; justify-content: center; border: 2px solid #fff;
    }
    #maya-widget-panel {
      position: fixed; bottom: 96px; ${position}: 24px; z-index: 99999;
      width: 380px; height: 600px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 20px;
      box-shadow: 0 8px 40px rgba(0,0,0,.18);
      display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(16px) scale(.97); pointer-events: none;
      transition: opacity .22s ease, transform .22s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #maya-widget-panel.open {
      opacity: 1; transform: translateY(0) scale(1); pointer-events: auto;
    }
    .maya-header {
      background: ${primaryColor}; color: #fff;
      padding: 16px 18px; display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    .maya-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: rgba(255,255,255,.25); display: flex;
      align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
    }
    .maya-header-info { flex: 1; }
    .maya-header-name { font-weight: 600; font-size: 15px; }
    .maya-header-sub { font-size: 12px; opacity: .85; }
    .maya-close {
      background: none; border: none; color: #fff; cursor: pointer; font-size: 20px;
      opacity: .8; padding: 4px; line-height: 1;
    }
    .maya-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 12px; background: #fafaf9;
    }
    .maya-msg { display: flex; align-items: flex-end; gap: 8px; }
    .maya-msg.user { flex-direction: row-reverse; }
    .maya-bubble {
      max-width: 78%; padding: 10px 14px; border-radius: 18px;
      font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    }
    .maya-bubble.bot {
      background: #fff; color: #1c1917; border: 1px solid #e7e5e4;
      border-bottom-left-radius: 4px;
    }
    .maya-bubble.user {
      background: ${primaryColor}; color: #fff; border-bottom-right-radius: 4px;
    }
    .maya-dots { display: flex; gap: 4px; padding: 4px 2px; }
    .maya-dot {
      width: 8px; height: 8px; background: #a8a29e; border-radius: 50%;
      animation: mayaBounce .9s infinite ease-in-out;
    }
    .maya-dot:nth-child(2) { animation-delay: .15s; }
    .maya-dot:nth-child(3) { animation-delay: .3s; }
    @keyframes mayaBounce {
      0%,80%,100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }
    .maya-order-bar {
      background: #fef3c7; border-top: 1px solid #fde68a;
      padding: 10px 16px; font-size: 13px; display: none;
      align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    .maya-order-bar.visible { display: flex; }
    .maya-order-count { font-weight: 600; color: #92400e; }
    .maya-order-total { color: #78350f; font-weight: 600; }
    .maya-input-area {
      padding: 12px 14px; background: #fff; border-top: 1px solid #e7e5e4;
      display: flex; gap: 8px; flex-shrink: 0;
    }
    .maya-input {
      flex: 1; border: 1px solid #d6d3d1; border-radius: 22px;
      padding: 10px 16px; font-size: 14px; outline: none; color: #1c1917;
      background: #fafaf9; transition: border-color .15s;
    }
    .maya-input:focus { border-color: ${primaryColor}; }
    .maya-send {
      background: ${primaryColor}; color: #fff; border: none; cursor: pointer;
      border-radius: 50%; width: 40px; height: 40px; font-size: 18px;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s; flex-shrink: 0;
    }
    .maya-send:disabled { background: #d6d3d1; cursor: not-allowed; }
    .maya-quick-prompts {
      display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 12px;
    }
    .maya-quick-btn {
      background: #fff; border: 1px solid #d6d3d1; border-radius: 20px;
      padding: 6px 12px; font-size: 12px; color: #57534e; cursor: pointer;
      transition: border-color .15s, color .15s;
    }
    .maya-quick-btn:hover { border-color: ${primaryColor}; color: ${primaryColor}; }
    @media (max-width: 480px) {
      #maya-widget-panel { width: calc(100vw - 16px); right: 8px !important; left: 8px !important; bottom: 80px; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── HTML ────────────────────────────────────────────────────────────────────
  const html = `
    <button id="maya-widget-btn" aria-label="Open chat">
      💬
      <span class="maya-badge" id="maya-badge">1</span>
    </button>
    <div id="maya-widget-panel" role="dialog" aria-label="Maya Chat">
      <div class="maya-header">
        <div class="maya-avatar">M</div>
        <div class="maya-header-info">
          <div class="maya-header-name">${restaurantName}</div>
          <div class="maya-header-sub">Maya · AI Order Assistant</div>
        </div>
        <button class="maya-close" id="maya-close" aria-label="Close">×</button>
      </div>
      <div class="maya-messages" id="maya-messages"></div>
      <div class="maya-quick-prompts" id="maya-quick-prompts">
        <button class="maya-quick-btn">See our menu</button>
        <button class="maya-quick-btn">Place an order</button>
        <button class="maya-quick-btn">Store hours</button>
        <button class="maya-quick-btn">Vegetarian options</button>
      </div>
      <div class="maya-order-bar" id="maya-order-bar">
        <span class="maya-order-count" id="maya-item-count">0 items</span>
        <span class="maya-order-total" id="maya-order-total">$0.00</span>
      </div>
      <div class="maya-input-area">
        <input class="maya-input" id="maya-input" type="text" placeholder="Type your order or ask anything..." autocomplete="off" />
        <button class="maya-send" id="maya-send" disabled aria-label="Send">➤</button>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  // ── Elements ─────────────────────────────────────────────────────────────────
  const btn = document.getElementById('maya-widget-btn');
  const panel = document.getElementById('maya-widget-panel');
  const closeBtn = document.getElementById('maya-close');
  const messagesEl = document.getElementById('maya-messages');
  const inputEl = document.getElementById('maya-input');
  const sendBtn = document.getElementById('maya-send');
  const quickPrompts = document.querySelectorAll('.maya-quick-btn');
  const orderBar = document.getElementById('maya-order-bar');
  const itemCountEl = document.getElementById('maya-item-count');
  const orderTotalEl = document.getElementById('maya-order-total');
  const badgeEl = document.getElementById('maya-badge');

  let isOpen = false;
  let isLoading = false;
  let hasBadge = true; // show badge on initial load

  // ── Toggle ───────────────────────────────────────────────────────────────────
  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    hideBadge();
    if (history.length === 0) renderWelcome();
    else renderHistory();
    inputEl.focus();
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  function hideBadge() { hasBadge = false; badgeEl.style.display = 'none'; }

  btn.addEventListener('click', () => isOpen ? closePanel() : openPanel());
  closeBtn.addEventListener('click', closePanel);

  // ── Render messages ──────────────────────────────────────────────────────────
  function renderWelcome() {
    const welcome = `Welcome to ${restaurantName}! I'm Maya, your order assistant. I can take your order, tell you about the menu, or answer any questions. What can I get you today?`;
    history = [{ role: 'assistant', content: welcome }];
    saveHistory(history);
    appendBubble('bot', welcome);
  }

  function renderHistory() {
    messagesEl.innerHTML = '';
    history.forEach(m => appendBubble(m.role === 'assistant' ? 'bot' : 'user', m.content, false));
    scrollBottom();
  }

  function appendBubble(type, text, scroll = true) {
    const row = document.createElement('div');
    row.className = `maya-msg ${type === 'user' ? 'user' : ''}`;
    const bubble = document.createElement('div');
    bubble.className = `maya-bubble ${type}`;
    bubble.textContent = text;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    if (scroll) scrollBottom();
  }

  function appendTyping() {
    const row = document.createElement('div');
    row.className = 'maya-msg';
    row.id = 'maya-typing';
    row.innerHTML = `<div class="maya-bubble bot"><div class="maya-dots"><div class="maya-dot"></div><div class="maya-dot"></div><div class="maya-dot"></div></div></div>`;
    messagesEl.appendChild(row);
    scrollBottom();
  }

  function removeTyping() {
    const t = document.getElementById('maya-typing');
    if (t) t.remove();
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Quick prompts ────────────────────────────────────────────────────────────
  const quickEl = document.getElementById('maya-quick-prompts');
  quickPrompts.forEach(btn => {
    btn.addEventListener('click', () => {
      sendMessage(btn.textContent);
      quickEl.style.display = 'none';
    });
  });

  // ── Input ────────────────────────────────────────────────────────────────────
  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim() || isLoading;
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading && inputEl.value.trim()) {
      e.preventDefault(); sendMessage(inputEl.value.trim());
    }
  });

  sendBtn.addEventListener('click', () => {
    if (!isLoading && inputEl.value.trim()) sendMessage(inputEl.value.trim());
  });

  // ── Send message ─────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (isLoading) return;
    quickEl.style.display = 'none';

    appendBubble('user', text);
    history.push({ role: 'user', content: text });
    inputEl.value = '';
    sendBtn.disabled = true;
    isLoading = true;
    appendTyping();

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, sessionId, restaurantId }),
      });
      const data = await res.json();
      removeTyping();
      const reply = data.message || "Sorry, something went wrong. Please try again!";
      appendBubble('bot', reply);
      history.push({ role: 'assistant', content: reply });
      saveHistory(history);
      refreshOrderBar();
    } catch {
      removeTyping();
      appendBubble('bot', "I'm having a moment — please try again!");
    } finally {
      isLoading = false;
      sendBtn.disabled = !inputEl.value.trim();
      inputEl.focus();
    }
  }

  // ── Order bar ────────────────────────────────────────────────────────────────
  async function refreshOrderBar() {
    try {
      const res = await fetch(`${apiBase}/api/order?sessionId=${sessionId}`);
      const data = await res.json();
      if (!data.empty && data.items?.length > 0) {
        const count = data.items.reduce((s, i) => s + i.quantity, 0);
        itemCountEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;
        orderTotalEl.textContent = data.subtotal || '$0.00';
        orderBar.classList.add('visible');
      } else {
        orderBar.classList.remove('visible');
      }
    } catch { /* best effort */ }
  }

  // Show badge after 3s if not opened
  setTimeout(() => {
    if (!isOpen && hasBadge) {
      badgeEl.style.display = 'flex';
    }
  }, 3000);

  console.log(`[Maya Widget] Loaded for restaurant: ${restaurantId}`);
})();

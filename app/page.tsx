'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

interface OrderItem {
  name: string;
  quantity: number;
  modifiers: string[];
  unit_price: string;
  line_total: string;
}

interface OrderState {
  empty: boolean;
  items: OrderItem[];
  subtotal: string;
  is_catering?: boolean;
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const key = 'restaurant_session_id';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Simple markdown bold renderer
function renderMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: "Welcome to Taqueria El Coral! I'm Maya, your order assistant. I can help you browse our menu, take your order, or answer any questions. What can I get started for you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [order, setOrder] = useState<OrderState>({ empty: true, items: [], subtotal: '$0.00' });
  const [sessionId, setSessionId] = useState('');
  const [orderOpen, setOrderOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSessionId(getOrCreateSessionId()); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const refreshOrder = useCallback(async (sid: string) => {
    if (!sid) return;
    try {
      const res = await fetch(`/api/order?sessionId=${sid}`);
      if (res.ok) setOrder(await res.json());
    } catch { /* best effort */ }
  }, []);

  useEffect(() => { if (sessionId) refreshOrder(sessionId); }, [sessionId, refreshOrder]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          sessionId,
          restaurantId: 'taqueria_el_coral_santa_teresa',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.message, timestamp: new Date() }]);
      await refreshOrder(sessionId);
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: "Sorry, I'm having a moment. Please try again!",
        timestamp: new Date(), isError: true,
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  const quickPrompts = ["Show me the taco menu", "What's your most popular dish?", "Do you have vegetarian options?", "I'd like to place an order"];
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden font-sans">
      {/* Chat area */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-700 flex items-center justify-center text-white font-bold text-base">M</div>
            <div>
              <h1 className="font-semibold text-stone-900 text-base leading-tight">Taqueria El Coral</h1>
              <p className="text-xs text-amber-700 font-medium">Maya · AI Order Assistant</p>
            </div>
          </div>
          <button
            onClick={() => setOrderOpen(!orderOpen)}
            className="relative flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Order
            {itemCount > 0 && (
              <span className="bg-amber-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{itemCount}</span>
            )}
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-amber-700 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">M</div>
              )}
              <div className="max-w-[78%]">
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-amber-700 text-white rounded-br-sm'
                    : msg.isError
                    ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                    : 'bg-white text-stone-800 shadow-sm border border-stone-100 rounded-bl-sm'
                }`}>
                  <div className="whitespace-pre-wrap">{renderMessage(msg.content)}</div>
                </div>
                <p className={`text-xs text-stone-400 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-amber-700 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">M</div>
              <div className="bg-white shadow-sm border border-stone-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-5">
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompts (first message only) */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {quickPrompts.map(p => (
              <button key={p} onClick={() => { setInput(p); inputRef.current?.focus(); }}
                className="text-xs bg-white border border-stone-200 text-stone-600 px-3 py-1.5 rounded-full hover:border-amber-500 hover:text-amber-700 transition-colors">
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="bg-white border-t border-stone-200 px-4 py-3">
          <form onSubmit={sendMessage} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your order or ask anything..."
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-amber-700 hover:bg-amber-800 disabled:bg-stone-200 disabled:cursor-not-allowed text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Order sidebar */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-white border-l border-stone-200 shadow-xl transform transition-transform duration-300 z-50 flex flex-col ${orderOpen ? 'translate-x-0' : 'translate-x-full'} lg:relative lg:translate-x-0 lg:shadow-none lg:z-auto`}>
        <div className="px-4 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-900">Current Order</h2>
          <button onClick={() => setOrderOpen(false)} className="lg:hidden text-stone-400 hover:text-stone-600">x</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {order.empty ? (
            <div className="text-center py-12">
              <p className="text-stone-500 text-sm">No items yet</p>
              <p className="text-stone-400 text-xs mt-1">Tell Maya what you'd like!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="bg-stone-50 rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 leading-tight">{item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}</p>
                      {item.modifiers.length > 0 && (
                        <p className="text-xs text-stone-500 mt-0.5">{item.modifiers.join(', ')}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-amber-700 ml-2 flex-shrink-0">{item.line_total}</p>
                  </div>
                </div>
              ))}
              {order.is_catering && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-800 font-medium">Catering order — manager will follow up</p>
                </div>
              )}
            </div>
          )}
        </div>

        {!order.empty && (
          <div className="px-4 py-4 border-t border-stone-200">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-stone-600">Subtotal</span>
              <span className="font-semibold text-stone-900">{order.subtotal}</span>
            </div>
            <button
              onClick={() => { setOrderOpen(false); setInput("I'm ready to place my order"); inputRef.current?.focus(); }}
              className="w-full bg-amber-700 hover:bg-amber-800 text-white py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Checkout via Chat
            </button>
            <p className="text-xs text-stone-400 text-center mt-2">Maya will collect your details</p>
          </div>
        )}
      </div>

      {/* Mobile overlay */}
      {orderOpen && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOrderOpen(false)} />}
    </div>
  );
}

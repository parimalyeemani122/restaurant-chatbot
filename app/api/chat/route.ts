import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { TOOL_DEFINITIONS, executeTool } from '@/lib/tools';
import fs from 'fs';
import path from 'path';

// Load API key from .env/.env.local if not in process.env
if (!process.env.ANTHROPIC_API_KEY) {
  for (const file of ['.env.local', '.env']) {
    try {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
      const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (match?.[1]?.trim()) { process.env.ANTHROPIC_API_KEY = match[1].trim(); break; }
    } catch { /* not found */ }
  }
}

function buildSystemPrompt(): string {
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  return `You are Maya, a fast and friendly AI order assistant for Taqueria El Coral in San Jose, CA.

CURRENT DATE & TIME (Pacific Time): ${now}
SESSION: Extract session_id from "[session_id: xxx]" at the end of user messages. Pass it to all order tools.
RESTAURANT ID: always "taqueria_el_coral_santa_teresa"

PERSONALITY: Warm and efficient. Short replies. Bold item names only (**Cali Burrito**). No lists unless asked.

LANGUAGE: If customer writes in Spanish, switch to Spanish for the whole conversation. Always pass item names/modifiers to tools in English.

━━━ LOCATION (ask first, once) ━━━
Two locations:
• Santa Teresa Blvd (5899 Santa Teresa Blvd #109) — online ordering ✅
• Capitol Expressway (426 W Capitol Expy) — phone only ❌

If Capitol Expressway: "Online ordering isn't available there yet. Call us at (669) 248-9997!"
If Santa Teresa or unclear from context: proceed.
If customer's first message is already an order, ask location first: "Are you ordering from Santa Teresa or Capitol Expressway?"

━━━ ORDERING — HOW TO HANDLE CHOICES ━━━
When an item requires a choice (meat, size, etc.):
✅ Ask ONE short question: "What meat?" or "What size?"
❌ NEVER list all the options — wait for them to ask or guess
❌ NEVER volunteer drink suggestions or upsells mid-order
If the customer names an off-menu drink (Diet Coke, Sprite, etc.):
→ Say briefly: "We don't carry that — we have energy drinks and tropical drinks. Want one?" Do NOT list sizes.

━━━ ADD_TO_ORDER RULES ━━━
✅ Only call add_to_order AFTER the customer explicitly confirms an item
❌ NEVER call it speculatively or when proposing options
❌ NEVER double-add (once proposed + once confirmed)
When adding multiple items the customer listed in one message → add them all in parallel tool calls

━━━ ORDER FLOW ━━━
1. Confirm location (once)
2. Take items — search_menu to get IDs, then add_to_order when confirmed
3. When customer says they're done: call view_order, read back the order with total (subtotal + 9.25% tax + $0.99 service fee)
4. Collect name, phone, pickup time. Email is optional ("Want a receipt emailed?")
5. Confirm once more, then place_order

Pickup time rules (Santa Teresa):
• Mon–Fri 10 AM–8 PM, Sat 10 AM–4 PM, Sun CLOSED — same-day only
• If vague ("6:30") → ask AM or PM
• If future date → "Same-day only online. Call (669) 248-9997 for future orders!"

ORDER CORRECTION:
• Before place_order: remove_from_order + add_to_order
• After place_order: void_order → re-confirm → place_order again

CATERING (total > $150 or customer mentions event/party):
→ Collect name, phone, event date, headcount, notes → call flag_catering. Don't take itemized order.

COMMON QUESTIONS: use get_restaurant_info for hours, location, allergens, payment, parking.
Severe allergy: "Call (669) 248-9997 — our kitchen confirms in real time."
Off-topic / complaint: "Reach us at (669) 248-9997."

HARD RULES:
• NEVER fabricate prices — use search_menu or get_item_details
• NEVER place_order without confirming the full order first
• ONE upsell max per conversation, only before order confirmed
• NEVER be rude or dismissive`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, sessionId, restaurantId = 'taqueria_el_coral_santa_teresa' } = body as {
      messages: Anthropic.MessageParam[];
      sessionId: string;
      restaurantId?: string;
    };

    if (!messages || !sessionId) {
      return NextResponse.json({ error: 'Missing messages or sessionId' }, { status: 400 });
    }

    // Strip any leading assistant messages — Anthropic requires first message to be user
    const trimmed = [...messages];
    while (trimmed.length > 0 && trimmed[0].role !== 'user') trimmed.shift();

    if (trimmed.length === 0) {
      return NextResponse.json({ error: 'No user message found' }, { status: 400 });
    }

    // Inject session context into last user message
    const augmented: Anthropic.MessageParam[] = trimmed.map((msg, idx) => {
      if (idx === trimmed.length - 1 && msg.role === 'user') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        return { ...msg, content: `${content}\n\n[session_id: ${sessionId}] [restaurant_id: ${restaurantId}]` };
      }
      return msg;
    });

    const MODEL = 'claude-sonnet-4-6';
    const MAX_TOKENS = 1024;
    const MAX_TOOL_ITERATIONS = 6;

    // Cap conversation history to last 16 messages (text only from frontend)
    const capped = augmented.slice(-16);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = buildSystemPrompt();
    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages: capped,
    });

    // Agentic tool loop — capped to prevent runaway context growth
    let loopMessages = [...capped];
    let iterations = 0;
    let lastTextBlock: string | null = null;

    while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(toolUseBlocks.map(async block => {
        let result: unknown;
        try {
          result = await executeTool(block.name, block.input as Record<string, unknown>);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : 'Tool execution failed' };
        }
        return { type: 'tool_result' as const, tool_use_id: block.id, content: JSON.stringify(result) };
      }));

      // Trim tool history: only keep last 6 tool-call rounds to prevent context overflow
      const baseMessages = loopMessages.slice(0, capped.length);
      const toolRounds = loopMessages.slice(capped.length);
      const trimmedToolRounds = toolRounds.slice(-12); // 6 rounds × 2 messages each
      loopMessages = [
        ...baseMessages,
        ...trimmedToolRounds,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: results },
      ];

      try {
        response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: TOOL_DEFINITIONS,
          messages: loopMessages,
        });
      } catch (loopErr) {
        console.error(`[chat tool loop error @ iteration ${iterations}]`, loopErr);
        // Return the last successful text response if available, else a safe fallback
        return NextResponse.json({
          message: lastTextBlock ?? "I had a hiccup processing that. Could you say it again?",
        });
      }

      const mid = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      if (mid) lastTextBlock = mid.text;
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return NextResponse.json({ message: textBlock?.text ?? lastTextBlock ?? "Could you say that again?" });
  } catch (err) {
    console.error('[chat route error]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 });
  }
}

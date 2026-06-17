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

  return `You are Maya, a friendly AI order assistant for Taqueria El Coral, a family-owned Mexican restaurant in San Jose, CA. You take food orders over chat, just like a real server would.

CURRENT DATE & TIME (Pacific Time): ${now}

PERSONALITY:
- Warm, efficient, and conversational — not robotic
- Address customers naturally, not formally
- Keep messages concise — don't dump the entire menu at once
- Use markdown only sparingly (bold for item names, that's it)

LANGUAGE HANDLING:
- Detect the customer's preferred language from how they write
- If they write in Spanish or say "Español"/"Spanish", respond in Spanish for the entire conversation
- If they write in English or say "English"/"Inglés", respond in English
- Default to English when uncertain
- IMPORTANT: Even when chatting in Spanish, always pass item names, modifiers, and special notes to tools in English — the kitchen reads English

YOUR COMPLETE ORDER FLOW:
1. Greet the customer warmly, mention the restaurant name
2. Ask how you can help (browse menu, place order, question about the restaurant)
3. Help them find items — search the menu, describe items accurately
4. For each item added, ALWAYS ask about modifications (e.g. "How would you like that?" or "Any modifications?")
5. After primary items are added, offer ONE upsell (relevant drink with food, side with main — keep it natural). NEVER upsell after the order is already confirmed.
6. When they're ready: call view_order, read the FULL order back to them clearly
7. For multi-item orders with different mods, list EACH unit on its own line — never group them:
   Instead of: "2 tacos (one salsa verde, one plain)"
   Do this:
   • Taco de Carne Asada — salsa verde
   • Taco de Carne Asada — plain
8. Show the full price breakdown from view_order: Subtotal, Tax (9.25%), Service Fee ($0.99), and Total
9. Collect: customer name, phone number, preferred pickup time
10. If pickup time is vague ("6:30" without AM/PM) → ask "6:30 AM or PM?". If "later" → ask what time.
11. Confirm everything one more time, then call place_order
12. Give them their order ID and estimated wait time

MODIFICATION HANDLING:
- Proactively ask about modifiers for items that have them
- If customer says something vague like "no dairy" or "extra spicy", pass it as a special note
- List options naturally, not as a bullet dump

ORDER CORRECTION:
- Mistake caught BEFORE place_order: remove wrong item, add correct one, done
- Mistake caught AFTER place_order was called (customer has an order ID):
  1. Acknowledge and apologize briefly
  2. Call void_order with short_order_id and session_id — cancels original and restores cart
  3. Confirm the correction, read back the full corrected order with price breakdown
  4. Re-collect info if anything changed, then call place_order again

CATERING RULE:
- If order total exceeds $150 OR customer mentions "event", "party", "catering", "large group" → switch to catering flow
- Collect: name, phone, event date, headcount, general menu preferences
- Call flag_catering and tell them a manager will follow up within 2 hours
- Do NOT take the full order detail — handled in the callback

COMMON QUESTIONS — ANSWER SAFELY:
- Hours, location, parking, delivery, payment, wifi: use get_restaurant_info and answer confidently
- General ingredient questions: answer using get_restaurant_info, add "Let me know if you have dietary needs and I'll note them on your order"
- Allergen/dietary questions ("gluten-free?", "contain dairy?"): use get_restaurant_info, then add "For allergy-critical questions, confirm directly with our team at (669) 248-9997"
- SEVERE allergy (anaphylaxis risk, nut allergy, Celiac): DO NOT guess — say "For your safety, please call us at (669) 248-9997 — our kitchen can confirm ingredients in real time"
- NEVER say "I guarantee" or make absolute promises about ingredients
- Off-topic questions: "That's outside what I can help with — reach us at (669) 248-9997"

ESCALATION:
- Complaints → immediately give manager number: (669) 248-9997
- Anything you can't answer → "Our manager's number is (669) 248-9997"

HARD RULES:
- NEVER make up prices — always check with search_menu or get_item_details
- NEVER confirm an order without calling place_order
- NEVER skip reading the order back (with full price breakdown) before placing
- NEVER be rude or dismissive
- ONE upsell attempt maximum per conversation, ONLY before order is confirmed

SESSION: The session_id will be injected at the end of the user's message as [session_id: xxx]. Extract it and pass it to all order tools. The restaurant_id is "taqueria_el_coral_santa_teresa" unless specified otherwise.`;
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
    const MAX_TOKENS = 2048; // order readback + multi-item confirmation can exceed 1024

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      tools: TOOL_DEFINITIONS,
      messages: augmented,
    });

    // Agentic tool loop
    const systemPrompt = buildSystemPrompt(); // build once per request for the tool loop
    let loopMessages = [...augmented];
    while (response.stop_reason === 'tool_use') {
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

      loopMessages = [
        ...loopMessages,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: results },
      ];

      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages: loopMessages,
      });
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return NextResponse.json({ message: textBlock?.text ?? "I'm having trouble right now. Please try again!" });
  } catch (err) {
    console.error('[chat route error]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 });
  }
}

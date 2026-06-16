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

const SYSTEM_PROMPT = `You are Maya, a friendly AI order assistant for Taqueria El Coral, a family-owned Mexican restaurant in San Jose, CA. You take food orders over chat, just like a real server would.

PERSONALITY:
- Warm, efficient, and conversational — not robotic
- Address customers naturally, not formally
- Keep messages concise — don't dump the entire menu at once
- Use markdown only sparingly (bold for item names, that's it)

YOUR COMPLETE ORDER FLOW:
1. Greet the customer warmly, mention the restaurant name
2. Ask how you can help (browse menu, place order, question about the restaurant)
3. Help them find items — search the menu, describe items accurately
4. For each item added, ALWAYS ask about modifications (e.g. "How would you like your steak cooked?" or "Any modifications to the burger?")
5. After primary items are added, offer ONE upsell (relevant drink with food, dessert after main — keep it natural, don't be pushy)
6. When they're ready: call view_order, read the FULL order back to them clearly
7. Collect: name, phone number, preferred pickup time
8. Confirm everything one more time, then call place_order
9. Give them their order ID and estimated wait time

MODIFICATION HANDLING:
- Proactively ask about modifiers for items that have them (steaks → doneness, burgers → add-ons, etc.)
- If customer says something vague like "no dairy" or "extra spicy", pass it as a special note
- List the relevant options naturally, not as a bullet dump

CATERING RULE:
- If order total exceeds $150 OR customer mentions "event", "party", "catering", "large group" → switch to catering flow
- Collect: name, phone, event date, headcount, general menu preferences
- Call flag_catering and tell them a manager will follow up within 2 hours
- Do NOT try to take the full order detail — that's handled in the callback

ESCALATION:
- Off-menu questions → use get_restaurant_info
- Complaints → give manager number: (669) 248-9997, offer to connect them
- Questions you can't answer → "Let me get you our manager's number: (669) 248-9997"

HARD RULES:
- NEVER make up prices — always check with search_menu or get_item_details
- NEVER confirm an order without calling place_order
- NEVER skip reading the order back before placing
- NEVER be rude or dismissive
- ONE upsell attempt maximum per conversation

SESSION: The session_id will be injected at the end of the user's message as [session_id: xxx]. Extract it and pass it to all order tools. The restaurant_id is "taqueria_el_coral_santa_teresa" unless specified otherwise.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, sessionId, restaurantId: rawRestaurantId = 'taqueria_el_coral_santa_teresa' } = body as {
      messages: Anthropic.MessageParam[];
      sessionId: string;
      restaurantId?: string;
    };
    const restaurantId = rawRestaurantId === 'taqueria-el-coral' ? 'taqueria_el_coral_santa_teresa' : rawRestaurantId;

    if (!messages || !sessionId) {
      return NextResponse.json({ error: 'Missing messages or sessionId' }, { status: 400 });
    }

    // Inject session context into last user message
    const augmented: Anthropic.MessageParam[] = messages.map((msg, idx) => {
      if (idx === messages.length - 1 && msg.role === 'user') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        return { ...msg, content: `${content}\n\n[session_id: ${sessionId}] [restaurant_id: ${restaurantId}]` };
      }
      return msg;
    });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages: augmented,
    });

    // Agentic tool loop
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
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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

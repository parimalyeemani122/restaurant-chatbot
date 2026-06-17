import Anthropic from '@anthropic-ai/sdk';
import { getDb, MenuItem, Order, Restaurant } from './db';
import { getRestaurantInfo } from './restaurant-info';
import { sendOrderEmail } from './email';
import { v4 as uuidv4 } from 'uuid';

const TAX_RATE = 0.0925; // San Jose, CA sales tax (matches website)
const SERVICE_FEE = 0.99;

// ── Maya Dashboard Integration ────────────────────────────────────────────────

async function postToMayaDashboard(order: Record<string, unknown>): Promise<void> {
  const mayaUrl = process.env.MAYA_DASHBOARD_URL;
  const ingestKey = process.env.MAYA_INGEST_KEY ?? '';
  if (!mayaUrl) {
    console.warn('[Maya] MAYA_DASHBOARD_URL not set — skipping dashboard push');
    return;
  }
  const url = `${mayaUrl}/api/orders/ingest`;
  console.log(`[Maya] Posting order ${order.order_id} to ${url}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ingestKey ? { 'x-maya-ingest-key': ingestKey } : {}),
      },
      body: JSON.stringify({ ...order, source: 'chatbot' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Maya] Ingest failed — status ${res.status}: ${body}`);
    } else {
      console.log(`[Maya] Order ${order.order_id} delivered to dashboard ✓`);
    }
  } catch (err) {
    console.error('[Maya] Ingest fetch error:', err);
  }
}

// ── Tool definitions for Claude ──────────────────────────────────────────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_menu',
    description: 'Search the restaurant menu by item name, category, or keyword. Always call this before adding items so you have the correct item IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term — item name, ingredient, or keyword' },
        category: { type: 'string', description: 'Filter by category: Appetizers, Burgers & Sandwiches, Mains, Salads, Sides, Drinks, Desserts, Kids' },
        restaurant_id: { type: 'string', description: 'Restaurant ID' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_menu_categories',
    description: 'Get all available menu categories and a brief summary of items in each. Use this to give the customer an overview of the menu.',
    input_schema: {
      type: 'object' as const,
      properties: {
        restaurant_id: { type: 'string', description: 'Restaurant ID' },
      },
      required: [],
    },
  },
  {
    name: 'get_item_details',
    description: 'Get full details for a specific menu item including all available modifiers and their prices.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_id: { type: 'string', description: 'The menu item ID' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'add_to_order',
    description: 'Add an item to the current order with optional modifications.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_id: { type: 'string', description: 'The menu item ID to add' },
        quantity: { type: 'number', description: 'How many to add (default 1)' },
        modifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of selected modifier names (e.g. ["Add bacon", "No onion", "Medium rare"])',
        },
        special_note: { type: 'string', description: 'Any special note for this specific item' },
        session_id: { type: 'string', description: 'Session ID for the order' },
      },
      required: ['item_id', 'session_id'],
    },
  },
  {
    name: 'view_order',
    description: 'View the current order — all items, quantities, modifications, and running total.',
    input_schema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'remove_from_order',
    description: 'Remove an item from the current order.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_id: { type: 'string', description: 'The menu item ID to remove' },
        session_id: { type: 'string', description: 'Session ID' },
      },
      required: ['item_id', 'session_id'],
    },
  },
  {
    name: 'place_order',
    description: 'Finalize and submit the order. Call this ONLY after confirming the full order with the customer and collecting their name, phone, and pickup time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: { type: 'string', description: 'Customer\'s name' },
        customer_phone: { type: 'string', description: 'Customer\'s phone number' },
        pickup_time: { type: 'string', description: 'Requested pickup time (e.g. "6:30 PM", "ASAP")' },
        special_instructions: { type: 'string', description: 'Any overall order notes' },
        session_id: { type: 'string', description: 'Session ID' },
        restaurant_id: { type: 'string', description: 'Restaurant ID' },
      },
      required: ['customer_name', 'customer_phone', 'pickup_time', 'session_id'],
    },
  },
  {
    name: 'flag_catering',
    description: 'Flag this as a catering/large order request and collect callback info. Use when order total exceeds $150 or customer mentions an event.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: { type: 'string', description: 'Customer\'s name' },
        customer_phone: { type: 'string', description: 'Customer\'s phone number' },
        event_date: { type: 'string', description: 'Event date' },
        headcount: { type: 'string', description: 'Number of guests' },
        notes: { type: 'string', description: 'Menu preferences or notes' },
        session_id: { type: 'string', description: 'Session ID' },
        restaurant_id: { type: 'string', description: 'Restaurant ID' },
      },
      required: ['customer_name', 'customer_phone', 'session_id'],
    },
  },
  {
    name: 'get_restaurant_info',
    description: 'Get restaurant information: hours, location, delivery, catering, allergens, payment, reservations, parking, or general info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'Topic: hours, location, delivery, catering, allergens, payment, reservations, parking' },
      },
    },
  },
  {
    name: 'void_order',
    description: 'Cancel a previously placed order (by its short 8-character order ID) and restore the cart so the customer can correct and re-place it. Use this ONLY when the customer reports an error after place_order was already called.',
    input_schema: {
      type: 'object' as const,
      properties: {
        short_order_id: { type: 'string', description: 'The 8-character order ID shown to the customer after place_order (e.g. "A1B2C3D4")' },
        session_id: { type: 'string', description: 'Session ID' },
      },
      required: ['short_order_id', 'session_id'],
    },
  },
];

// ── In-memory order store (per session) ──────────────────────────────────────

interface OrderItem {
  item_id: string;
  name: string;
  quantity: number;
  modifiers: string[];
  unit_price: number;
  modifier_delta: number;
  special_note?: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  modifiers: string; // JSON
  unit_price: number;
  line_total: number;
}

const orders = new Map<string, OrderItem[]>();
const upsellDone = new Set<string>(); // track if upsell was offered this session

export function getOrderItems(sessionId: string): OrderItem[] {
  return orders.get(sessionId) ?? [];
}

function cartTotal(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + (i.unit_price + i.modifier_delta) * i.quantity, 0);
}

// ── Tool implementations ──────────────────────────────────────────────────────

function searchMenu(query: string, category?: string, restaurantId = 'taqueria_el_coral_santa_teresa'): object {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;
  let rows: MenuItem[];
  if (category) {
    rows = db.prepare(
      `SELECT * FROM menu_items WHERE restaurant_id = ? AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?) AND LOWER(category) = ? AND available = 1 ORDER BY name`
    ).all(restaurantId, q, q, category.toLowerCase()) as MenuItem[];
  } else {
    rows = db.prepare(
      `SELECT * FROM menu_items WHERE restaurant_id = ? AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?) AND available = 1 ORDER BY category, name`
    ).all(restaurantId, q, q, q) as MenuItem[];
  }
  if (rows.length === 0) return { found: false, message: `No items found matching "${query}"${category ? ` in ${category}` : ''}. Try a different search.` };
  return {
    found: true,
    count: rows.length,
    items: rows.map(r => ({
      id: r.id, name: r.name, category: r.category,
      price: r.price, description: r.description,
      has_modifiers: (JSON.parse(r.modifiers) as object[]).length > 0,
    })),
  };
}

function getMenuCategories(restaurantId = 'taqueria_el_coral_santa_teresa'): object {
  const db = getDb();
  const rows = db.prepare(
    `SELECT category, COUNT(*) as count, MIN(price) as min_price, MAX(price) as max_price FROM menu_items WHERE restaurant_id = ? AND available = 1 GROUP BY category ORDER BY category`
  ).all(restaurantId) as { category: string; count: number; min_price: number; max_price: number }[];
  return { categories: rows.map(r => ({ category: r.category, item_count: r.count, price_range: `$${r.min_price.toFixed(2)} – $${r.max_price.toFixed(2)}` })) };
}

function getItemDetails(itemId: string): object {
  const db = getDb();
  const item = db.prepare(`SELECT * FROM menu_items WHERE id = ?`).get(itemId) as MenuItem | undefined;
  if (!item) return { found: false, message: 'Item not found.' };
  const mods = JSON.parse(item.modifiers) as { name: string; price_delta: number }[];
  return {
    found: true,
    item: {
      id: item.id, name: item.name, category: item.category,
      description: item.description, price: item.price,
      modifiers: mods.map(m => ({ name: m.name, extra_cost: m.price_delta > 0 ? `+$${m.price_delta.toFixed(2)}` : 'free' })),
    },
  };
}

function addToOrder(itemId: string, sessionId: string, quantity = 1, modifiers: string[] = [], specialNote?: string): object {
  if (!Number.isInteger(quantity) || quantity < 1) return { success: false, message: 'Quantity must be a positive whole number.' };
  const db = getDb();
  const item = db.prepare(`SELECT * FROM menu_items WHERE id = ? AND available = 1`).get(itemId) as MenuItem | undefined;
  if (!item) return { success: false, message: 'Item not found or unavailable.' };

  const availableMods = JSON.parse(item.modifiers) as { name: string; price_delta: number }[];
  let modDelta = 0;
  const validMods: string[] = [];
  for (const mod of modifiers) {
    const found = availableMods.find(m => m.name.toLowerCase() === mod.toLowerCase());
    if (found) { validMods.push(found.name); modDelta += found.price_delta; }
    else validMods.push(mod); // allow free-text notes too
  }

  if (!orders.has(sessionId)) orders.set(sessionId, []);
  const cart = orders.get(sessionId)!;
  const existingIdx = cart.findIndex(i => i.item_id === itemId && JSON.stringify(i.modifiers) === JSON.stringify(validMods));
  if (existingIdx >= 0) {
    cart[existingIdx].quantity += quantity;
  } else {
    cart.push({ item_id: itemId, name: item.name, quantity, modifiers: validMods, unit_price: item.price, modifier_delta: modDelta, special_note: specialNote });
  }

  const total = cartTotal(cart);
  const linePrice = (item.price + modDelta) * quantity;
  return {
    success: true,
    added: { name: item.name, quantity, modifiers: validMods, line_price: `$${linePrice.toFixed(2)}` },
    order_total: `$${total.toFixed(2)}`,
    is_catering_threshold: total >= 150,
  };
}

function viewOrder(sessionId: string): object {
  const cart = orders.get(sessionId) ?? [];
  if (cart.length === 0) {
    return {
      empty: true, items: [],
      subtotal: '$0.00', tax: '$0.00', service_fee: `$${SERVICE_FEE.toFixed(2)}`, total: `$${SERVICE_FEE.toFixed(2)}`,
    };
  }
  const subtotal = cartTotal(cart);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + SERVICE_FEE;
  return {
    empty: false,
    items: cart.map(i => ({
      name: i.name, quantity: i.quantity,
      modifiers: i.modifiers,
      unit_price: `$${(i.unit_price + i.modifier_delta).toFixed(2)}`,
      line_total: `$${((i.unit_price + i.modifier_delta) * i.quantity).toFixed(2)}`,
      special_note: i.special_note,
    })),
    subtotal: `$${subtotal.toFixed(2)}`,
    tax: `$${tax.toFixed(2)}`,
    service_fee: `$${SERVICE_FEE.toFixed(2)}`,
    total: `$${total.toFixed(2)}`,
    is_catering: subtotal >= 150,
  };
}

function removeFromOrder(itemId: string, sessionId: string): object {
  const cart = orders.get(sessionId) ?? [];
  const idx = cart.findIndex(i => i.item_id === itemId);
  if (idx === -1) {
    // Try fuzzy match by name
    const nameIdx = cart.findIndex(i => i.name.toLowerCase().includes(itemId.toLowerCase()));
    if (nameIdx === -1) return { success: false, message: 'That item is not in your order.' };
    const removed = cart.splice(nameIdx, 1)[0];
    return { success: true, message: `Removed ${removed.name} from your order.`, order_total: `$${cartTotal(cart).toFixed(2)}` };
  }
  const removed = cart.splice(idx, 1)[0];
  return { success: true, message: `Removed ${removed.name} from your order.`, order_total: `$${cartTotal(cart).toFixed(2)}` };
}

async function placeOrder(
  customerName: string, customerPhone: string, pickupTime: string,
  sessionId: string, restaurantId = 'taqueria_el_coral_santa_teresa', specialInstructions?: string
): Promise<object> {
  const cart = orders.get(sessionId) ?? [];
  if (cart.length === 0) return { success: false, message: 'Your order is empty. Please add items before placing the order.' };

  // Basic phone validation — must have at least 10 digits
  const digits = customerPhone.replace(/\D/g, '');
  if (digits.length < 10) {
    return { success: false, message: `"${customerPhone}" doesn't look like a valid phone number. Please ask the customer for their 10-digit phone number.` };
  }

  const subtotal = cartTotal(cart);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const orderTotal = +(subtotal + tax + SERVICE_FEE).toFixed(2);
  const db = getDb();

  const orderTx = db.transaction(() => {
    const orderId = uuidv4();
    db.prepare(`INSERT INTO orders (id, restaurant_id, session_id, customer_name, customer_phone, pickup_time, order_type, status, subtotal, special_instructions)
      VALUES (?, ?, ?, ?, ?, ?, 'standard', 'confirmed', ?, ?)`)
      .run(orderId, restaurantId, sessionId, customerName.trim(), customerPhone.trim(), pickupTime.trim(), +subtotal.toFixed(2), specialInstructions ?? null);

    for (const item of cart) {
      db.prepare(`INSERT INTO order_items (id, order_id, menu_item_id, item_name, quantity, modifiers, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuidv4(), orderId, item.item_id, item.name, item.quantity, JSON.stringify(item.modifiers), item.unit_price + item.modifier_delta, +((item.unit_price + item.modifier_delta) * item.quantity).toFixed(2));
    }
    return orderId;
  });

  const orderId = orderTx();
  orders.delete(sessionId); // clear cart

  const restaurant = db.prepare(`SELECT * FROM restaurants WHERE id = ?`).get(restaurantId) as Restaurant | undefined;
  const prep = restaurant?.prep_time_minutes ?? 15;
  const restaurantName = restaurant?.name ?? 'The Maple Table';

  const shortId = orderId.slice(0, 8).toUpperCase();
  const emailItems = cart.map(i => ({
    name: i.name,
    quantity: i.quantity,
    modifiers: i.modifiers,
    line_total: `$${((i.unit_price + i.modifier_delta) * i.quantity).toFixed(2)}`,
  }));

  sendOrderEmail({
    order_id: shortId,
    restaurant_name: restaurantName,
    customer_name: customerName,
    customer_phone: customerPhone,
    pickup_time: pickupTime,
    order_type: 'standard',
    items: emailItems,
    subtotal: `$${subtotal.toFixed(2)}`,
    estimated_ready: `${prep} minutes`,
    special_instructions: specialInstructions,
    timestamp: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  }).catch(() => { /* already logged inside sendOrderEmail */ });

  await postToMayaDashboard({
    order_id: orderId,
    restaurant_id: restaurantId,
    timestamp: new Date().toISOString(),
    customer: { name: customerName, phone: customerPhone, pickup_time: pickupTime },
    order_type: 'standard',
    items: cart.map(i => ({
      menu_item_id: i.item_id,
      name: i.name,
      quantity: i.quantity,
      modifiers: i.modifiers,
      unit_price: +(i.unit_price + i.modifier_delta).toFixed(2),
      line_total: +((i.unit_price + i.modifier_delta) * i.quantity).toFixed(2),
    })),
    subtotal: +subtotal.toFixed(2),
    tax: tax,
    service_fee: SERVICE_FEE,
    total: orderTotal,
    estimated_prep_minutes: prep,
    special_instructions: specialInstructions ?? '',
    status: 'confirmed',
  });

  return {
    success: true,
    order_id: shortId,
    customer_name: customerName,
    customer_phone: customerPhone,
    pickup_time: pickupTime,
    items: cart.map(i => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers })),
    subtotal: `$${subtotal.toFixed(2)}`,
    tax: `$${tax.toFixed(2)}`,
    service_fee: `$${SERVICE_FEE.toFixed(2)}`,
    total: `$${orderTotal.toFixed(2)}`,
    estimated_ready: `${prep} minutes`,
    message: `Order confirmed! Your order ID is ${shortId}. Estimated ready in ${prep} minutes.`,
  };
}

async function flagCatering(
  customerName: string, customerPhone: string, sessionId: string,
  restaurantId = 'taqueria_el_coral_santa_teresa', eventDate?: string, headcount?: string, notes?: string
): Promise<object> {
  const db = getDb();
  const orderId = uuidv4();
  db.prepare(`INSERT INTO orders (id, restaurant_id, session_id, customer_name, customer_phone, pickup_time, order_type, status, subtotal, special_instructions)
    VALUES (?, ?, ?, ?, ?, ?, 'catering', 'pending_callback', 0, ?)`)
    .run(orderId, restaurantId, sessionId, customerName.trim(), customerPhone.trim(),
      eventDate ?? 'TBD',
      `Headcount: ${headcount ?? 'TBD'} | Notes: ${notes ?? 'None'}`);
  orders.delete(sessionId);
  const cateringShortId = orderId.slice(0, 8).toUpperCase();
  const cateringRestaurant = db.prepare(`SELECT * FROM restaurants WHERE id = ?`).get(restaurantId) as Restaurant | undefined;

  sendOrderEmail({
    order_id: cateringShortId,
    restaurant_name: cateringRestaurant?.name ?? 'The Maple Table',
    customer_name: customerName,
    customer_phone: customerPhone,
    pickup_time: eventDate ?? 'TBD',
    order_type: 'catering',
    items: [],
    subtotal: '$0.00',
    estimated_ready: '',
    special_instructions: `Headcount: ${headcount ?? 'TBD'} | Notes: ${notes ?? 'None'}`,
    timestamp: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  }).catch(() => {});

  await postToMayaDashboard({
    order_id: orderId,
    restaurant_id: restaurantId,
    timestamp: new Date().toISOString(),
    customer: { name: customerName, phone: customerPhone, pickup_time: eventDate ?? 'TBD' },
    order_type: 'catering',
    items: [],
    subtotal: 0,
    estimated_prep_minutes: 0,
    special_instructions: `Headcount: ${headcount ?? 'TBD'} | Notes: ${notes ?? 'None'}`,
    status: 'pending_callback',
  });

  return {
    success: true,
    order_id: cateringShortId,
    message: `Catering request logged! A manager will call ${customerPhone} within 2 hours to confirm details and pricing. Reference ID: ${cateringShortId}.`,
  };
}

async function voidOrder(shortOrderId: string, sessionId: string): Promise<object> {
  const db = getDb();
  const order = db.prepare(
    `SELECT * FROM orders WHERE UPPER(SUBSTR(id, 1, 8)) = ? AND session_id = ? AND status = 'confirmed'`
  ).get(shortOrderId.toUpperCase(), sessionId) as Order | undefined;

  if (!order) {
    return { success: false, message: `Order ${shortOrderId} not found or cannot be cancelled. It may not belong to this session or was already cancelled.` };
  }

  db.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ?`).run(order.id);

  // Restore cart from saved order items so the customer can correct and re-place
  const rows = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id) as OrderItemRow[];
  if (rows.length > 0) {
    orders.set(sessionId, rows.map(r => ({
      item_id: r.menu_item_id,
      name: r.item_name,
      quantity: r.quantity,
      modifiers: JSON.parse(r.modifiers) as string[],
      unit_price: r.unit_price,
      modifier_delta: 0,
    })));
  }

  // Best-effort: notify Maya dashboard of cancellation
  const mayaUrl = process.env.MAYA_DASHBOARD_URL;
  if (mayaUrl) {
    fetch(`${mayaUrl}/api/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => {});
  }

  return {
    success: true,
    voided_order_id: shortOrderId,
    cart_restored: rows.map(r => ({ name: r.item_name, quantity: r.quantity })),
    message: `Order ${shortOrderId} has been cancelled and your previous items have been restored. Please tell me what you'd like to change.`,
  };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export async function executeTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'search_menu':
      return searchMenu(input.query as string, input.category as string | undefined, input.restaurant_id as string | undefined);
    case 'get_menu_categories':
      return getMenuCategories(input.restaurant_id as string | undefined);
    case 'get_item_details':
      return getItemDetails(input.item_id as string);
    case 'add_to_order':
      return addToOrder(input.item_id as string, input.session_id as string, input.quantity as number ?? 1, input.modifiers as string[] ?? [], input.special_note as string | undefined);
    case 'view_order':
      return viewOrder(input.session_id as string);
    case 'remove_from_order':
      return removeFromOrder(input.item_id as string, input.session_id as string);
    case 'place_order':
      return placeOrder(input.customer_name as string, input.customer_phone as string, input.pickup_time as string, input.session_id as string, input.restaurant_id as string ?? 'taqueria_el_coral_santa_teresa', input.special_instructions as string | undefined);
    case 'flag_catering':
      return flagCatering(input.customer_name as string, input.customer_phone as string, input.session_id as string, input.restaurant_id as string ?? 'taqueria_el_coral_santa_teresa', input.event_date as string | undefined, input.headcount as string | undefined, input.notes as string | undefined);
    case 'get_restaurant_info':
      return { info: getRestaurantInfo(input.topic as string | undefined) };
    case 'void_order':
      return voidOrder(input.short_order_id as string, input.session_id as string);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

export function getOrderForSession(sessionId: string) {
  return viewOrder(sessionId);
}

export { upsellDone, cartTotal, getOrderItems as getRawOrderItems };

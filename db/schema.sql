-- Restaurants (multi-tenant ready)
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  hours TEXT NOT NULL DEFAULT '{}',
  prep_time_minutes INTEGER NOT NULL DEFAULT 15,
  catering_threshold_dollars REAL NOT NULL DEFAULT 150.0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Menu items with modifier support
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  modifiers TEXT NOT NULL DEFAULT '[]',  -- JSON array: [{name, price_delta, required}]
  combos TEXT NOT NULL DEFAULT '[]'      -- JSON array: [{name, items, price}]
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  session_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  pickup_time TEXT,
  order_type TEXT NOT NULL DEFAULT 'standard',  -- standard | catering | callback
  status TEXT NOT NULL DEFAULT 'confirmed',      -- confirmed | pending_callback | escalated
  subtotal REAL NOT NULL DEFAULT 0,
  special_instructions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  menu_item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  modifiers TEXT NOT NULL DEFAULT '[]',  -- JSON array of selected modifier names
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);

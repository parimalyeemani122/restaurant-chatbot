import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'db', 'restaurant.db');
const SCHEMA_PATH = path.join(process.cwd(), 'db', 'schema.sql');

const db = new Database(DB_PATH);
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

// ── Sample Restaurant ────────────────────────────────────────────────────────
const RESTAURANT_ID = 'maple-table-001';

db.prepare(`INSERT OR REPLACE INTO restaurants (id, name, phone, email, address, hours, prep_time_minutes, catering_threshold_dollars) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(
    RESTAURANT_ID,
    'The Maple Table',
    '(669) 248-9997',
    'orders@mapletable.com',
    '482 Maple Street, Greenville, CA 94102',
    JSON.stringify({
      monday:    { open: '11:00', close: '21:00' },
      tuesday:   { open: '11:00', close: '21:00' },
      wednesday: { open: '11:00', close: '21:00' },
      thursday:  { open: '11:00', close: '21:00' },
      friday:    { open: '11:00', close: '22:00' },
      saturday:  { open: '10:00', close: '22:00' },
      sunday:    { open: '10:00', close: '21:00' },
    }),
    15,
    150.0,
  );

// ── Menu Items ───────────────────────────────────────────────────────────────
const items = [
  // Appetizers
  {
    name: 'Crispy Calamari',
    category: 'Appetizers',
    description: 'Golden-fried squid rings with marinara and lemon aioli',
    price: 14.99,
    modifiers: [
      { name: 'Extra marinara', price_delta: 1.00 },
      { name: 'Spicy version', price_delta: 0 },
    ],
  },
  {
    name: 'Buffalo Wings',
    category: 'Appetizers',
    description: 'Crispy wings tossed in house buffalo sauce, served with blue cheese',
    price: 15.99,
    modifiers: [
      { name: 'Mild sauce', price_delta: 0 },
      { name: 'Hot sauce', price_delta: 0 },
      { name: 'Honey BBQ sauce', price_delta: 0 },
      { name: 'Extra blue cheese', price_delta: 0.75 },
      { name: 'Extra crispy', price_delta: 0 },
    ],
  },
  {
    name: 'Spinach Artichoke Dip',
    category: 'Appetizers',
    description: 'Creamy baked dip with toasted pita and tortilla chips',
    price: 12.99,
    modifiers: [
      { name: 'Extra pita', price_delta: 1.50 },
      { name: 'Add jalapeños', price_delta: 0.50 },
    ],
  },
  {
    name: 'Truffle Fries',
    category: 'Appetizers',
    description: 'Crispy shoestring fries with truffle oil, parmesan, and fresh herbs',
    price: 10.99,
    modifiers: [
      { name: 'Extra truffle oil', price_delta: 1.00 },
      { name: 'Add bacon bits', price_delta: 1.50 },
    ],
  },

  // Burgers & Sandwiches
  {
    name: 'Classic Smash Burger',
    category: 'Burgers & Sandwiches',
    description: 'Double smash patty, American cheese, pickles, onion, house sauce on brioche bun',
    price: 16.99,
    modifiers: [
      { name: 'Add bacon', price_delta: 2.50 },
      { name: 'Add avocado', price_delta: 2.00 },
      { name: 'Extra cheese', price_delta: 1.00 },
      { name: 'No pickles', price_delta: 0 },
      { name: 'No onion', price_delta: 0 },
      { name: 'Gluten-free bun', price_delta: 2.00 },
      { name: 'Lettuce wrap instead of bun', price_delta: 0 },
    ],
  },
  {
    name: 'BBQ Bacon Burger',
    category: 'Burgers & Sandwiches',
    description: 'Beef patty, smoked bacon, cheddar, crispy onion strings, BBQ sauce',
    price: 18.99,
    modifiers: [
      { name: 'Extra bacon', price_delta: 2.50 },
      { name: 'Extra BBQ sauce', price_delta: 0 },
      { name: 'No onion strings', price_delta: 0 },
      { name: 'Gluten-free bun', price_delta: 2.00 },
    ],
  },
  {
    name: 'Grilled Chicken Sandwich',
    category: 'Burgers & Sandwiches',
    description: 'Herb-marinated grilled chicken, lettuce, tomato, honey mustard on ciabatta',
    price: 15.99,
    modifiers: [
      { name: 'Add bacon', price_delta: 2.50 },
      { name: 'Add avocado', price_delta: 2.00 },
      { name: 'Swap to crispy chicken', price_delta: 0 },
      { name: 'No tomato', price_delta: 0 },
      { name: 'Extra honey mustard', price_delta: 0 },
    ],
  },
  {
    name: 'Veggie Black Bean Burger',
    category: 'Burgers & Sandwiches',
    description: 'House-made black bean patty, pepper jack, roasted peppers, chipotle mayo',
    price: 14.99,
    modifiers: [
      { name: 'Add avocado', price_delta: 2.00 },
      { name: 'Extra chipotle mayo', price_delta: 0 },
      { name: 'Gluten-free bun', price_delta: 2.00 },
    ],
  },

  // Mains
  {
    name: 'Cedar Plank Salmon',
    category: 'Mains',
    description: 'Atlantic salmon, lemon dill butter, seasonal vegetables, wild rice',
    price: 28.99,
    modifiers: [
      { name: 'No butter (plain)', price_delta: 0 },
      { name: 'Extra vegetables', price_delta: 2.00 },
      { name: 'Swap rice for fries', price_delta: 0 },
    ],
  },
  {
    name: 'New York Strip Steak',
    category: 'Mains',
    description: '12oz NY strip, herb butter, garlic mashed potatoes, asparagus',
    price: 39.99,
    modifiers: [
      { name: 'Rare', price_delta: 0 },
      { name: 'Medium rare', price_delta: 0 },
      { name: 'Medium', price_delta: 0 },
      { name: 'Medium well', price_delta: 0 },
      { name: 'Well done', price_delta: 0 },
      { name: 'Add mushroom sauce', price_delta: 3.00 },
      { name: 'Add peppercorn sauce', price_delta: 3.00 },
      { name: 'Swap asparagus for fries', price_delta: 0 },
    ],
  },
  {
    name: 'Pasta Carbonara',
    category: 'Mains',
    description: 'Rigatoni, pancetta, egg yolk, pecorino, black pepper',
    price: 21.99,
    modifiers: [
      { name: 'Add chicken', price_delta: 4.00 },
      { name: 'Add shrimp', price_delta: 6.00 },
      { name: 'Gluten-free pasta', price_delta: 2.00 },
      { name: 'Extra parmesan', price_delta: 1.00 },
      { name: 'Make it spicy', price_delta: 0 },
    ],
  },
  {
    name: 'BBQ Pulled Pork Platter',
    category: 'Mains',
    description: 'Slow-smoked pulled pork, coleslaw, cornbread, two sides',
    price: 22.99,
    modifiers: [
      { name: 'Extra BBQ sauce', price_delta: 0 },
      { name: 'Mac & cheese side', price_delta: 1.50 },
      { name: 'Sweet potato fries side', price_delta: 1.50 },
    ],
  },
  {
    name: 'Margherita Flatbread',
    category: 'Mains',
    description: 'Hand-stretched dough, San Marzano tomato, fresh mozzarella, basil, EVOO',
    price: 17.99,
    modifiers: [
      { name: 'Add pepperoni', price_delta: 2.50 },
      { name: 'Add prosciutto', price_delta: 3.50 },
      { name: 'Add arugula', price_delta: 1.00 },
      { name: 'Extra mozzarella', price_delta: 2.00 },
      { name: 'Make it spicy (chili flakes)', price_delta: 0 },
    ],
  },

  // Salads
  {
    name: 'Caesar Salad',
    category: 'Salads',
    description: 'Romaine, house Caesar dressing, croutons, shaved parmesan',
    price: 13.99,
    modifiers: [
      { name: 'Add grilled chicken', price_delta: 5.00 },
      { name: 'Add shrimp', price_delta: 7.00 },
      { name: 'Add salmon', price_delta: 8.00 },
      { name: 'Dressing on the side', price_delta: 0 },
      { name: 'No croutons', price_delta: 0 },
      { name: 'Extra dressing', price_delta: 0.50 },
    ],
  },
  {
    name: 'Maple Harvest Salad',
    category: 'Salads',
    description: 'Mixed greens, candied pecans, dried cranberries, goat cheese, maple vinaigrette',
    price: 14.99,
    modifiers: [
      { name: 'Add grilled chicken', price_delta: 5.00 },
      { name: 'Dressing on the side', price_delta: 0 },
      { name: 'No goat cheese', price_delta: 0 },
      { name: 'Add avocado', price_delta: 2.00 },
    ],
  },

  // Kids Menu
  {
    name: 'Kids Grilled Cheese',
    category: 'Kids',
    description: 'Buttery toasted sandwich with American cheese, served with apple slices',
    price: 7.99,
    modifiers: [
      { name: 'Swap apple for fries', price_delta: 0 },
      { name: 'Add a drink (lemonade or juice)', price_delta: 2.00 },
    ],
  },
  {
    name: 'Kids Mac & Cheese',
    category: 'Kids',
    description: 'Creamy macaroni and cheese, served with a side',
    price: 7.99,
    modifiers: [
      { name: 'Add broccoli', price_delta: 0 },
      { name: 'Add a drink', price_delta: 2.00 },
    ],
  },

  // Sides
  {
    name: 'French Fries',
    category: 'Sides',
    description: 'Classic golden fries with house seasoning',
    price: 4.99,
    modifiers: [
      { name: 'Add cheese sauce', price_delta: 1.50 },
      { name: 'Add bacon bits', price_delta: 1.50 },
      { name: 'Seasoned salt', price_delta: 0 },
    ],
  },
  {
    name: 'Sweet Potato Fries',
    category: 'Sides',
    description: 'Crispy sweet potato fries with chipotle dipping sauce',
    price: 5.99,
    modifiers: [],
  },
  {
    name: 'Side Salad',
    category: 'Sides',
    description: 'Mixed greens, cherry tomatoes, cucumber, choice of dressing',
    price: 5.99,
    modifiers: [
      { name: 'Ranch', price_delta: 0 },
      { name: 'Caesar', price_delta: 0 },
      { name: 'Balsamic vinaigrette', price_delta: 0 },
      { name: 'Honey mustard', price_delta: 0 },
    ],
  },
  {
    name: 'Mac & Cheese',
    category: 'Sides',
    description: 'Creamy three-cheese mac with breadcrumb topping',
    price: 5.99,
    modifiers: [
      { name: 'Add bacon', price_delta: 1.50 },
      { name: 'Add jalapeños', price_delta: 0.50 },
    ],
  },

  // Drinks
  {
    name: 'Fresh Lemonade',
    category: 'Drinks',
    description: 'Hand-squeezed lemonade, sweetened or unsweetened',
    price: 4.99,
    modifiers: [
      { name: 'Unsweetened', price_delta: 0 },
      { name: 'Add strawberry', price_delta: 0.50 },
      { name: 'Add mint', price_delta: 0 },
    ],
  },
  {
    name: 'Soft Drink',
    category: 'Drinks',
    description: 'Coke, Diet Coke, Sprite, or Ginger Ale — free refills',
    price: 3.99,
    modifiers: [
      { name: 'Coke', price_delta: 0 },
      { name: 'Diet Coke', price_delta: 0 },
      { name: 'Sprite', price_delta: 0 },
      { name: 'Ginger Ale', price_delta: 0 },
    ],
  },
  {
    name: 'Iced Tea',
    category: 'Drinks',
    description: 'Fresh-brewed black or green iced tea',
    price: 3.99,
    modifiers: [
      { name: 'Sweet tea', price_delta: 0 },
      { name: 'Unsweetened', price_delta: 0 },
      { name: 'Add lemon', price_delta: 0 },
    ],
  },
  {
    name: 'Craft Beer (Draft)',
    category: 'Drinks',
    description: 'Ask about our rotating taps — local craft selections',
    price: 7.99,
    modifiers: [],
  },
  {
    name: 'House Wine',
    category: 'Drinks',
    description: 'Red or white — ask your server for today\'s selection',
    price: 9.99,
    modifiers: [
      { name: 'Red', price_delta: 0 },
      { name: 'White', price_delta: 0 },
    ],
  },

  // Desserts
  {
    name: 'Warm Chocolate Lava Cake',
    category: 'Desserts',
    description: 'Molten chocolate cake with vanilla ice cream and raspberry coulis',
    price: 9.99,
    modifiers: [
      { name: 'Extra ice cream scoop', price_delta: 2.00 },
      { name: 'No raspberry (plain)', price_delta: 0 },
    ],
  },
  {
    name: 'New York Cheesecake',
    category: 'Desserts',
    description: 'Classic creamy cheesecake on graham crust with mixed berry compote',
    price: 8.99,
    modifiers: [
      { name: 'Add whipped cream', price_delta: 0 },
      { name: 'Strawberry topping instead', price_delta: 0 },
    ],
  },
  {
    name: 'Maple Crème Brûlée',
    category: 'Desserts',
    description: 'Vanilla custard with a caramelized maple sugar crust',
    price: 8.99,
    modifiers: [],
  },
];

const insertItem = db.prepare(`
  INSERT OR REPLACE INTO menu_items (id, restaurant_id, name, category, description, price, available, modifiers, combos)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?, '[]')
`);

const seedAll = db.transaction(() => {
  for (const item of items) {
    insertItem.run(uuidv4(), RESTAURANT_ID, item.name, item.category, item.description, item.price, JSON.stringify(item.modifiers));
  }
});

seedAll();
console.log(`✅ Seeded restaurant: The Maple Table`);
console.log(`✅ Seeded ${items.length} menu items across ${[...new Set(items.map(i => i.category))].length} categories`);
db.close();

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'db', 'restaurant.db');
const SCHEMA_PATH = path.join(process.cwd(), 'db', 'schema.sql');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  }
  return _db;
}

export interface Restaurant {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  hours: string; // JSON
  prep_time_minutes: number;
  catering_threshold_dollars: number;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  available: number;
  modifiers: string; // JSON
}

export interface Order {
  id: string;
  restaurant_id: string;
  session_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_time: string | null;
  order_type: string;
  status: string;
  subtotal: number;
  special_instructions: string | null;
  created_at: string;
}

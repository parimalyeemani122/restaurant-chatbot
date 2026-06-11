/**
 * Email notification service
 * Sends order confirmations to the restaurant inbox via SendGrid SMTP relay.
 *
 * Uses existing env vars (already in .env):
 *   SENDGRID_API_KEY      — your SendGrid API key (SG.xxx)
 *   SENDGRID_FROM_EMAIL   — verified sender address in SendGrid
 *   ORDER_NOTIFICATION_EMAIL — restaurant inbox to deliver to
 */

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// ── Env guard (same pattern as chat route) ────────────────────────────────────
function loadEmailEnv() {
  const needed = ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL', 'ORDER_NOTIFICATION_EMAIL'];
  if (needed.every(k => process.env[k])) return; // all set
  for (const file of ['.env.local', '.env']) {
    try {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
      for (const key of needed) {
        if (!process.env[key]) {
          const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
          if (match?.[1]?.trim()) process.env[key] = match[1].trim();
        }
      }
    } catch { /* file not found */ }
  }
}

function getTransporter() {
  loadEmailEnv();
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || apiKey === 'SG.xxx') return null; // not configured — skip silently
  // SendGrid SMTP relay — works with nodemailer, no extra package needed
  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: { user: 'apikey', pass: apiKey },
  });
}

// ── Order email ────────────────────────────────────────────────────────────────

export interface OrderEmailPayload {
  order_id: string;
  restaurant_name: string;
  customer_name: string;
  customer_phone: string;
  pickup_time: string;
  order_type: 'standard' | 'catering';
  items: { name: string; quantity: number; modifiers: string[]; line_total: string }[];
  subtotal: string;
  estimated_ready: string;
  special_instructions?: string;
  timestamp: string;
}

function buildOrderHtml(o: OrderEmailPayload): string {
  const itemRows = o.items
    .map(i => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede9;">
          ${i.quantity > 1 ? `<strong>${i.quantity}×</strong> ` : ''}${i.name}
          ${i.modifiers.length ? `<br><small style="color:#78716c;">${i.modifiers.join(' · ')}</small>` : ''}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede9;text-align:right;white-space:nowrap;">
          ${i.line_total}
        </td>
      </tr>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:100%;">

  <!-- Header -->
  <tr><td style="background:#92400e;padding:24px 32px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🍁 ${o.restaurant_name}</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:14px;">
      ${o.order_type === 'catering' ? '🎉 Catering Request' : '🛎️ New Order'} · ${o.timestamp}
    </p>
  </td></tr>

  <!-- Order ID banner -->
  <tr><td style="background:#fef3c7;padding:12px 32px;border-bottom:1px solid #fde68a;">
    <p style="margin:0;font-size:13px;color:#92400e;">
      Order ID: <strong style="font-size:16px;letter-spacing:1px;">${o.order_id}</strong>
      &nbsp;·&nbsp; Pickup: <strong>${o.pickup_time}</strong>
      ${o.estimated_ready ? `&nbsp;·&nbsp; Est. Ready: <strong>${o.estimated_ready}</strong>` : ''}
    </p>
  </td></tr>

  <!-- Customer -->
  <tr><td style="padding:24px 32px 0;">
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1c1917;text-transform:uppercase;letter-spacing:.5px;">Customer</h2>
    <p style="margin:0;font-size:15px;color:#292524;"><strong>${o.customer_name}</strong></p>
    <p style="margin:4px 0 0;font-size:14px;color:#78716c;">${o.customer_phone}</p>
  </td></tr>

  <!-- Items -->
  <tr><td style="padding:20px 32px 0;">
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1c1917;text-transform:uppercase;letter-spacing:.5px;">
      ${o.order_type === 'catering' ? 'Catering Details' : 'Order Items'}
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0ede9;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#fafaf9;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;letter-spacing:.5px;">Item</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;letter-spacing:.5px;">Price</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </td></tr>

  <!-- Total -->
  <tr><td style="padding:16px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:16px;font-weight:700;color:#1c1917;">Total</td>
        <td style="font-size:16px;font-weight:700;color:#92400e;text-align:right;">${o.subtotal}</td>
      </tr>
    </table>
  </td></tr>

  ${o.special_instructions ? `
  <tr><td style="padding:0 32px 20px;">
    <div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:12px 16px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#78716c;text-transform:uppercase;letter-spacing:.5px;">Special Instructions</p>
      <p style="margin:0;font-size:14px;color:#292524;">${o.special_instructions}</p>
    </div>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="padding:20px 32px;border-top:1px solid #f0ede9;text-align:center;">
    <p style="margin:0;font-size:12px;color:#a8a29e;">
      Sent by Maya AI · ${o.restaurant_name}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildCateringHtml(o: OrderEmailPayload): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#fafaf9;padding:32px 16px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  <div style="background:#92400e;padding:24px 32px;">
    <h1 style="margin:0;color:#fff;font-size:22px;">🍁 ${o.restaurant_name} — Catering Request</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:14px;">${o.timestamp}</p>
  </div>
  <div style="padding:24px 32px;">
    <p style="font-size:16px;font-weight:700;color:#92400e;margin:0 0 16px;">Reference: ${o.order_id}</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#292524;">
      <tr><td style="padding:6px 0;color:#78716c;width:140px;">Customer</td><td><strong>${o.customer_name}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#78716c;">Phone</td><td><strong>${o.customer_phone}</strong></td></tr>
      ${o.pickup_time !== 'TBD' ? `<tr><td style="padding:6px 0;color:#78716c;">Event Date</td><td><strong>${o.pickup_time}</strong></td></tr>` : ''}
      ${o.special_instructions ? `<tr><td style="padding:6px 0;color:#78716c;vertical-align:top;">Notes</td><td>${o.special_instructions}</td></tr>` : ''}
    </table>
    <div style="margin-top:20px;background:#fef3c7;border-radius:8px;padding:14px 18px;">
      <p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">⏰ Follow up within 2 hours</p>
      <p style="margin:4px 0 0;font-size:13px;color:#78350f;">Call the customer to confirm details and pricing.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function sendOrderEmail(payload: OrderEmailPayload): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[email] Not configured — skipping. Set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, ORDER_NOTIFICATION_EMAIL in .env');
    return;
  }
  loadEmailEnv();
  const to = process.env.ORDER_NOTIFICATION_EMAIL || 'frontline.solutions.team@gmail.com';
  const from = process.env.SENDGRID_FROM_EMAIL || 'frontline.solutions.team@gmail.com';
  const isCatering = payload.order_type === 'catering';

  try {
    await transporter.sendMail({
      from: `"Maya AI — ${payload.restaurant_name}" <${from}>`,
      to,
      subject: isCatering
        ? `🎉 Catering Request — ${payload.customer_name} (Ref: ${payload.order_id})`
        : `🛎️ New Order #${payload.order_id} — ${payload.customer_name} · Pickup: ${payload.pickup_time}`,
      html: isCatering ? buildCateringHtml(payload) : buildOrderHtml(payload),
    });
    console.log(`[email] Order confirmation sent → ${to} (Order: ${payload.order_id})`);
  } catch (err) {
    // Never crash the order flow if email fails
    console.error('[email] Failed to send notification:', err instanceof Error ? err.message : err);
  }
}

// Per-restaurant FAQ. In production this comes from the DB.
// Structure key → natural language answer.

export const RESTAURANT_FAQ: Record<string, string> = {
  hours: `We're open 7 days a week:
• Monday–Thursday: 11:00 AM – 9:00 PM
• Friday: 11:00 AM – 10:00 PM
• Saturday: 10:00 AM – 10:00 PM
• Sunday: 10:00 AM – 9:00 PM
Kitchen closes 30 minutes before closing time.`,

  location: `We're at 482 Maple Street, Greenville, CA 94102 — right next to the post office. Free parking in the lot behind us.`,

  contact: `• Phone: (669) 248-9997
• Email: orders@mapletable.com
• Instagram: @themapletable`,

  delivery: `Yes, we offer delivery through DoorDash and Uber Eats. For direct orders through this chat, we offer curbside pickup — just pull up out front and we'll bring it out.`,

  catering: `We do catering for groups and events! Orders over $150 get our full catering experience. For catering requests, we'll need: your name, contact number, event date, estimated headcount, and any dietary needs. A manager will follow up within 2 hours to confirm.`,

  allergens: `We take allergies seriously. Please let us know any allergies and we'll flag the kitchen. Our most common allergen-friendly options: gluten-free bun for burgers (+$2), gluten-free pasta (+$2), and we can prepare most items without nuts on request. We're not a nut-free facility.`,

  payment: `We accept all major credit/debit cards, Apple Pay, Google Pay, and cash. For pre-orders placed through chat, we collect payment at pickup.`,

  reservations: `We're walk-in only for dining in. For parties of 8 or more, call us at (669) 248-9997 to arrange seating. Catering orders should be placed at least 48 hours in advance.`,

  wifi: `Free WiFi available — network: MapleTable_Guest, password: maple2024`,

  parking: `Free parking lot behind the restaurant (entrance on Elm Street). Street parking also available on Maple Street.`,

  policy: `• We kindly ask that you pick up your order within 15 minutes of the ready time.
• Modifications are welcome — just tell us what you need.
• Catering orders require 24-hour notice and a deposit for groups over 20.
• We can accommodate most dietary restrictions — just ask!`,
};

export function getRestaurantInfo(topic?: string): string {
  if (!topic) {
    return `The Maple Table is a casual American restaurant in Greenville, CA. We serve burgers, mains, salads, pasta, and more. Ask me about our menu, hours, delivery, catering, or anything else!`;
  }
  const key = topic.toLowerCase();
  for (const [k, v] of Object.entries(RESTAURANT_FAQ)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return RESTAURANT_FAQ.policy;
}

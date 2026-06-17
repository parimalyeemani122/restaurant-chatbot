export const RESTAURANT_FAQ: Record<string, string> = {
  hours: `Our hours vary by location:

**Santa Teresa Blvd** (5899 Santa Teresa Blvd #109):
• Monday – Friday: 10:00 AM – 8:00 PM
• Saturday: 10:00 AM – 4:00 PM
• Sunday: Closed

**Capitol Expressway** (426 W Capitol Expy):
• Monday – Thursday: 10:00 AM – 9:00 PM
• Friday – Sunday: 9:00 AM – 9:00 PM`,

  location: `We have two locations in San Jose:
• **Santa Teresa**: 5899 Santa Teresa Blvd #109, San Jose, CA 95123
• **Capitol Expressway**: 426 W Capitol Expy, San Jose, CA 95136`,

  contact: `• Phone / Manager: (669) 248-9997
• Email: frontline.solutions.team@gmail.com`,

  delivery: `We offer pickup orders through this chat. For delivery, check DoorDash or Uber Eats.`,

  catering: `We do catering for groups and events! Orders over $150 qualify for our catering service. We'll need your name, phone number, event date, and estimated headcount. A manager will call you back within 2 hours to confirm details.`,

  allergens: `Please let us know about any allergies and we'll flag the kitchen. We can accommodate many dietary needs — just ask! We offer veggie options across most of our menu.`,

  payment: `We accept all major credit/debit cards, Apple Pay, and cash. Payment is collected at pickup.`,

  parking: `Both locations have free parking available on site.`,

  policy: `• Please pick up your order within 15 minutes of the ready time.
• Modifications are welcome — just let us know.
• Catering orders require at least 24 hours notice.`,
};

export function getRestaurantInfo(topic?: string): string {
  if (!topic) {
    return `Taqueria El Coral is a family-owned Mexican restaurant in San Jose, CA. We serve tacos, burritos, quesadillas, tortas, seafood, breakfast, and more. Ask me about our menu, hours, locations, or anything else!`;
  }
  const key = topic.toLowerCase();
  for (const [k, v] of Object.entries(RESTAURANT_FAQ)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return RESTAURANT_FAQ.policy;
}

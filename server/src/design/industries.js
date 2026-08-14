/**
 * A small library of common industries/brand types. Both AI providers use this
 * to turn a vague prompt ("make a banner for my gym") into a specific visual
 * direction — accent colour, imagery, tone — without the model having to guess
 * design conventions from scratch. Pure data, no dependencies.
 */
export const INDUSTRIES = [
  {
    id: 'fitness', label: 'Fitness & gym', keywords: ['gym', 'fitness', 'workout', 'training', 'crossfit', 'yoga', 'sport'],
    accent: '#E11D48', dark: true, icon: 'Dumbbell',
    imageQuery: 'professional muscular athlete gym dark moody',
    headline: 'TRANSFORM YOUR BODY', subtitle: 'Elite training. Real results. Join the movement today.', cta: 'JOIN NOW',
  },
  {
    id: 'restaurant', label: 'Restaurant & food', keywords: ['restaurant', 'food', 'menu', 'cafe', 'bakery', 'kitchen', 'dining'],
    accent: '#D9A441', dark: true, icon: 'Flame',
    imageQuery: 'gourmet food plating dark moody',
    headline: 'TASTE THE DIFFERENCE', subtitle: 'Crafted with the finest ingredients, served with passion.', cta: 'RESERVE A TABLE',
  },
  {
    id: 'fashion', label: 'Fashion & retail', keywords: ['fashion', 'clothing', 'store', 'boutique', 'apparel', 'shoes', 'accessories'],
    accent: '#0A0A0A', dark: false, icon: 'ShoppingCart',
    imageQuery: 'fashion model studio editorial',
    headline: 'NEW COLLECTION', subtitle: 'Designed for people who expect more.', cta: 'SHOP NOW',
  },
  {
    id: 'realestate', label: 'Real estate', keywords: ['real estate', 'realty', 'property', 'homes', 'apartment', 'realtor'],
    accent: '#166534', dark: false, icon: 'Building',
    imageQuery: 'modern luxury home architecture exterior',
    headline: 'FIND YOUR NEXT HOME', subtitle: 'Curated properties, honest guidance, every step.', cta: 'VIEW LISTINGS',
  },
  {
    id: 'tech', label: 'Technology & SaaS', keywords: ['saas', 'startup', 'app', 'software', 'tech', 'ai', 'platform'],
    accent: '#2563EB', dark: true, icon: 'Zap',
    imageQuery: 'modern technology abstract dark gradient',
    headline: 'BUILD FASTER', subtitle: 'The platform teams switch to and never leave.', cta: 'GET STARTED',
  },
  {
    id: 'healthcare', label: 'Healthcare & wellness', keywords: ['health', 'clinic', 'medical', 'dentist', 'therapy', 'wellness', 'doctor'],
    accent: '#0D9488', dark: false, icon: 'Stethoscope',
    imageQuery: 'calm modern healthcare clinic interior',
    headline: 'CARE THAT COMES FIRST', subtitle: 'Compassionate, modern care for your whole family.', cta: 'BOOK A VISIT',
  },
  {
    id: 'beauty', label: 'Beauty & salon', keywords: ['salon', 'spa', 'beauty', 'hair', 'nails', 'skincare', 'makeup'],
    accent: '#DB2777', dark: false, icon: 'Sparkles',
    imageQuery: 'elegant beauty salon soft light',
    headline: 'LOOK. FEEL. GLOW.', subtitle: 'Premium care in a space made for you.', cta: 'BOOK NOW',
  },
  {
    id: 'education', label: 'Education', keywords: ['school', 'course', 'academy', 'university', 'class', 'tutor', 'learning'],
    accent: '#7C3AED', dark: true, icon: 'GraduationCap',
    imageQuery: 'modern classroom students learning bright',
    headline: 'LEARN WITHOUT LIMITS', subtitle: 'Real skills, real mentors, real outcomes.', cta: 'ENROLL TODAY',
  },
  {
    id: 'finance', label: 'Finance & business', keywords: ['finance', 'bank', 'invest', 'accounting', 'consulting', 'business', 'corporate'],
    accent: '#0A0A0A', dark: true, icon: 'Wallet',
    imageQuery: 'modern office skyline professional dark',
    headline: 'GROW WITH CONFIDENCE', subtitle: 'Straightforward advice for serious decisions.', cta: 'TALK TO US',
  },
  {
    id: 'travel', label: 'Travel & hospitality', keywords: ['travel', 'hotel', 'resort', 'tour', 'vacation', 'flight', 'hospitality'],
    accent: '#0891B2', dark: false, icon: 'Globe',
    imageQuery: 'beautiful travel destination scenic',
    headline: 'YOUR NEXT ESCAPE', subtitle: 'Unforgettable places, effortlessly booked.', cta: 'EXPLORE NOW',
  },
  {
    id: 'events', label: 'Events & parties', keywords: ['event', 'party', 'wedding', 'festival', 'concert', 'celebration'],
    accent: '#D9A441', dark: true, icon: 'Calendar',
    imageQuery: 'vibrant event celebration lights',
    headline: "YOU'RE INVITED", subtitle: 'An evening to remember, made just for you.', cta: 'RSVP NOW',
  },
  {
    id: 'automotive', label: 'Automotive', keywords: ['car', 'auto', 'dealership', 'garage', 'mechanic', 'vehicle'],
    accent: '#0A0A0A', dark: true, icon: 'Car',
    imageQuery: 'sleek car studio dramatic lighting',
    headline: 'ENGINEERED TO PERFORM', subtitle: 'Precision, power, and a ride you will love.', cta: 'BOOK A TEST DRIVE',
  },
  {
    id: 'music', label: 'Music & entertainment', keywords: ['music', 'band', 'concert', 'dj', 'studio', 'entertainment'],
    accent: '#7C3AED', dark: true, icon: 'Music',
    imageQuery: 'concert stage lights dramatic',
    headline: 'FEEL THE SOUND', subtitle: 'Live, loud, and unforgettable.', cta: 'GET TICKETS',
  },
  {
    id: 'nonprofit', label: 'Nonprofit & charity', keywords: ['nonprofit', 'charity', 'donate', 'foundation', 'volunteer', 'community'],
    accent: '#166534', dark: false, icon: 'Heart',
    imageQuery: 'community volunteers helping warm light',
    headline: 'TOGETHER WE CAN', subtitle: 'Every contribution changes a life.', cta: 'DONATE NOW',
  },
  {
    id: 'photography', label: 'Photography & creative', keywords: ['photography', 'photographer', 'studio', 'portfolio', 'creative', 'design agency'],
    accent: '#0A0A0A', dark: true, icon: 'Camera',
    imageQuery: 'professional photography studio moody',
    headline: 'MOMENTS, CAPTURED', subtitle: 'A portfolio of stories worth telling.', cta: 'SEE THE WORK',
  },
];

/** Best-guess industry from free text, or null if nothing matches confidently. */
export function detectIndustry(text = '') {
  const t = text.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const industry of INDUSTRIES) {
    const score = industry.keywords.filter((k) => t.includes(k)).length;
    if (score > bestScore) {
      best = industry;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Industry knowledge, used by the keyless planner (MockProvider) to turn a
 * vague prompt into a real brief without a language model: which visual style
 * suits the trade, what the photography should actually look like, and copy
 * that sounds like a brand rather than a placeholder.
 *
 * When DeepSeek is configured it art-directs from scratch and this is only a
 * safety net. Pure data, no dependencies.
 */
export const INDUSTRIES = [
  {
    id: 'fitness', label: 'Fitness & gym', keywords: ['gym', 'fitness', 'workout', 'training', 'crossfit', 'yoga', 'sport'],
    style: 'bold-poster', accent: '#E4322B', dark: true, icon: 'Dumbbell',
    imageQuery: 'low angle of an athlete mid-lift, single hard light, dark gym, deep shadows',
    subject: 'athlete training', negativeSpace: 'left',
    eyebrow: 'NEW YEAR INTAKE', headline: 'STRONGER BY MARCH',
    subtitle: 'Coached sessions, measured progress, no guesswork.', cta: 'CLAIM THE OFFER',
  },
  {
    id: 'restaurant', label: 'Restaurant & food', keywords: ['restaurant', 'food', 'menu', 'cafe', 'bakery', 'kitchen', 'dining'],
    style: 'luxury-editorial', accent: '#C9A227', dark: true, icon: 'Flame',
    imageQuery: 'overhead plated dish on dark stone, single soft window light, rich shadow, fine dining',
    subject: 'plated dish', negativeSpace: 'top',
    eyebrow: 'KITCHEN & BAR', headline: 'Dinner, properly made',
    subtitle: 'A short menu that changes with the market.', cta: 'Reserve a table',
  },
  {
    id: 'fashion', label: 'Fashion & retail', keywords: ['fashion', 'clothing', 'store', 'boutique', 'apparel', 'shoes', 'accessories'],
    style: 'modern-minimal', accent: '#111110', dark: false, icon: 'ShoppingCart',
    imageQuery: 'full length studio portrait of a model, seamless backdrop, soft directional light, editorial fashion',
    subject: 'fashion model', negativeSpace: 'right',
    eyebrow: 'AUTUMN COLLECTION', headline: 'Made to be worn out',
    subtitle: 'Twelve pieces, cut from one cloth.', cta: 'Shop the collection',
  },
  {
    id: 'realestate', label: 'Real estate', keywords: ['real estate', 'realty', 'property', 'homes', 'apartment', 'realtor'],
    style: 'modern-minimal', accent: '#1F5EFF', dark: false, icon: 'Building',
    imageQuery: 'modern house exterior at dusk, warm interior light, wide architectural shot, clean sky',
    subject: 'modern home', negativeSpace: 'top',
    eyebrow: 'NOW VIEWING', headline: 'Room to think',
    subtitle: 'Four homes released this month, each with its own garden.', cta: 'Book a viewing',
  },
  {
    id: 'tech', label: 'Technology & SaaS', keywords: ['saas', 'startup', 'app', 'software', 'tech', 'ai', 'platform'],
    style: 'tech-futuristic', accent: '#4C8DFF', dark: true, icon: 'Zap',
    imageQuery: 'abstract macro of circuitry with cool blue rim light, dark background, shallow depth of field',
    subject: 'technology detail', negativeSpace: 'left',
    eyebrow: 'RELEASE 2.4', headline: 'Ship it on Friday',
    subtitle: 'The workflow layer your team stops working around.', cta: 'Start free',
  },
  {
    id: 'healthcare', label: 'Healthcare & wellness', keywords: ['health', 'clinic', 'medical', 'dentist', 'therapy', 'wellness', 'doctor'],
    style: 'soft-elegant', accent: '#0D9488', dark: false, icon: 'Stethoscope',
    imageQuery: 'calm clinic interior with soft daylight, plants, clean modern architecture, muted palette',
    subject: 'clinic interior', negativeSpace: 'right',
    eyebrow: 'ACCEPTING PATIENTS', headline: 'Care without the wait',
    subtitle: 'Same-week appointments with doctors who remember your name.', cta: 'Book a visit',
  },
  {
    id: 'beauty', label: 'Beauty & salon', keywords: ['salon', 'spa', 'beauty', 'hair', 'nails', 'skincare', 'makeup'],
    style: 'soft-elegant', accent: '#B98070', dark: false, icon: 'Sparkles',
    imageQuery: 'close beauty portrait, soft diffused light, dewy skin, neutral backdrop, editorial retouch',
    subject: 'beauty portrait', negativeSpace: 'left',
    eyebrow: 'STUDIO', headline: 'Quietly transformative',
    subtitle: 'Colour, cut and care by people who train every month.', cta: 'Book now',
  },
  {
    id: 'education', label: 'Education', keywords: ['school', 'course', 'academy', 'university', 'class', 'tutor', 'learning'],
    style: 'corporate-clean', accent: '#7C3AED', dark: true, icon: 'GraduationCap',
    imageQuery: 'students working together in bright modern studio, natural window light, candid',
    subject: 'students learning', negativeSpace: 'right',
    eyebrow: 'ENROLLING NOW', headline: 'Learn it properly',
    subtitle: 'Twelve weeks, real projects, mentors who have shipped.', cta: 'Enroll today',
  },
  {
    id: 'finance', label: 'Finance & business', keywords: ['finance', 'bank', 'invest', 'accounting', 'consulting', 'business', 'corporate'],
    style: 'corporate-clean', accent: '#2E9BFF', dark: true, icon: 'Wallet',
    imageQuery: 'modern office tower detail at blue hour, clean geometry, cool light, minimal',
    subject: 'modern architecture', negativeSpace: 'left',
    eyebrow: 'PRIVATE CLIENTS', headline: 'Decisions, not products',
    subtitle: 'Independent advice from advisers paid by you alone.', cta: 'Talk to us',
  },
  {
    id: 'travel', label: 'Travel & hospitality', keywords: ['travel', 'hotel', 'resort', 'tour', 'vacation', 'flight', 'hospitality'],
    style: 'warm-organic', accent: '#B4531F', dark: false, icon: 'Globe',
    imageQuery: 'wide landscape at golden hour, dramatic light, empty sky, travel photography',
    subject: 'landscape', negativeSpace: 'top',
    eyebrow: 'LIMITED DATES', headline: 'Go while it is quiet',
    subtitle: 'Small groups, local guides, nothing scripted.', cta: 'See the dates',
  },
  {
    id: 'events', label: 'Events & parties', keywords: ['event', 'party', 'wedding', 'festival', 'concert', 'celebration'],
    style: 'vibrant-energetic', accent: '#FF3D7F', dark: true, icon: 'Calendar',
    imageQuery: 'crowd under stage lights, motion blur, warm haze, shot from the pit',
    subject: 'live crowd', negativeSpace: 'bottom',
    eyebrow: 'ONE NIGHT ONLY', headline: 'Doors at eight',
    subtitle: 'Three rooms, six acts, one very late finish.', cta: 'Get tickets',
  },
  {
    id: 'automotive', label: 'Automotive', keywords: ['car', 'auto', 'dealership', 'garage', 'mechanic', 'vehicle'],
    style: 'street-urban', accent: '#D6FF3D', dark: true, icon: 'Car',
    imageQuery: 'three quarter view of a car in a dark studio, hard rim light, wet floor reflection',
    subject: 'car in studio', negativeSpace: 'left',
    eyebrow: 'TEST DRIVES', headline: 'Built for the long way',
    subtitle: 'Book an hour with it. Bring the coast road.', cta: 'Book a drive',
  },
  {
    id: 'music', label: 'Music & entertainment', keywords: ['music', 'band', 'concert', 'dj', 'studio', 'entertainment'],
    style: 'street-urban', accent: '#D6FF3D', dark: true, icon: 'Music',
    imageQuery: 'performer silhouetted against stage lights, haze, high contrast, shot from side stage',
    subject: 'live performance', negativeSpace: 'bottom',
    eyebrow: 'LIVE', headline: 'Loud, on purpose',
    subtitle: 'New material, first time played anywhere.', cta: 'Get tickets',
  },
  {
    id: 'nonprofit', label: 'Nonprofit & charity', keywords: ['nonprofit', 'charity', 'donate', 'foundation', 'volunteer', 'community'],
    style: 'warm-organic', accent: '#B4531F', dark: false, icon: 'Heart',
    imageQuery: 'documentary portrait of volunteers working, warm natural light, honest and unposed',
    subject: 'volunteers', negativeSpace: 'right',
    eyebrow: 'THIS WINTER', headline: 'One hour changes a week',
    subtitle: 'Ninety-four pence in every pound reaches the doorstep.', cta: 'Give today',
  },
  {
    id: 'photography', label: 'Photography & creative', keywords: ['photography', 'photographer', 'studio', 'portfolio', 'creative', 'design agency'],
    style: 'luxury-editorial', accent: '#C9A227', dark: true, icon: 'Camera',
    imageQuery: 'moody studio portrait with a single softbox, deep falloff, film grain',
    subject: 'studio portrait', negativeSpace: 'left',
    eyebrow: 'SELECTED WORK', headline: 'Light, held still',
    subtitle: 'Portraits and stills for people who care how it looks.', cta: 'See the work',
  },
  {
    id: 'kids', label: 'Kids & family', keywords: ['kids', 'children', 'birthday', 'nursery', 'toy', 'playgroup', 'family day'],
    style: 'playful-bright', accent: '#FF7A1A', dark: false, icon: 'Gift',
    imageQuery: 'children playing outdoors in bright afternoon sun, candid, colourful, joyful',
    subject: 'children playing', negativeSpace: 'top',
    eyebrow: 'SATURDAY', headline: 'A very big day out',
    subtitle: 'Games, cake and a bouncy castle that never stops.', cta: 'Save a spot',
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

/** One valid raw block per block type — shared by the schema, operations and layout tests. */
export const SAMPLES = {
  title: { type: 'title', text: 'YOUR WEBSITE\nIS LOSING\nYOU SALES', size: 'xl' },
  statement: { type: 'statement', text: 'NOBODY WANTS TO LOOK AT AN HVAC WEBSITE.', tone: 'problem' },
  bigtype: { type: 'bigtype', text: '8:47 PM', caption: 'A customer submits your form' },
  quote: { type: 'quote', text: '"I paid for this click. What happens now?"' },
  flow: { type: 'flow', direction: 'up', tone: 'money', steps: ['GOOGLE', 'WEBSITE', 'CONTACT', 'LEAD', 'CUSTOMER', '$1,500 JOB'] },
  hub: {
    type: 'hub', center: 'BROWSER', links: 'spokes+cross',
    nodes: ['HTML', 'CSS', 'IMAGES', 'FONTS', 'ANALYTICS', 'CHAT', 'HEATMAP', 'BOOKING', 'REVIEWS', 'PIXELS'],
  },
  cards: {
    type: 'cards', columns: 3, tone: 'problem',
    items: [{ label: "Phone isn't clickable", tag: 'LEAK' }, { label: 'CTA buried', tag: 'LEAK' }, { label: 'No service area', tag: 'LEAK' }],
  },
  compare: {
    type: 'compare',
    left: { heading: 'GENERIC AI', tone: 'tech', steps: ['QUESTION', 'LLM', 'GENERIC ANSWER'] },
    right: { heading: 'BUSINESS AI', tone: 'money', steps: ['QUESTION', 'BUSINESS KNOWLEDGE', 'ANSWER', 'BOOKING'], footnote: 'Services · Pricing · Policies' },
  },
  panels: {
    type: 'panels',
    panels: [
      { heading: 'CONTENT', tone: 'money', rows: [{ label: 'Headline', state: 'open' }, { label: 'Phone', state: 'open' }] },
      { heading: 'LAYOUT', tone: 'tech', rows: [{ label: 'Layout system', state: 'locked' }] },
    ],
  },
  code: { type: 'code', text: '<a href="tel:+15551234567">' },
  timeline: {
    type: 'timeline', direction: 'right',
    events: [{ when: '8:47 PM', label: 'Form submitted' }, { when: '9:10 PM', label: 'Email sits in an inbox' }, { when: '8:00 AM', label: 'Owner finally sees it' }],
  },
  funnel: {
    type: 'funnel', tone: 'money',
    stages: [{ label: 'Searches', value: '1,000' }, { label: 'Clicks', value: '120' }, { label: 'Leads', value: '12' }, { label: 'Customers', value: '4' }],
  },
  browser: { type: 'browser', url: 'example.com', title: 'Your homepage', placeholder: 'screenshot' },
  equation: { type: 'equation', terms: ['ATTENTION', 'CONVERSION', 'VALUE'], operator: '×', result: 'REVENUE' },
  loop: { type: 'loop', center: 'THE SALES LOOP', nodes: ['ATTENTION', 'LEAD', 'CUSTOMER', 'RESULT', 'REVIEW', 'REFERRAL'] },
  matrix: {
    type: 'matrix', columns: ['FEATURE', 'PROBLEM', 'VALUE'], tones: ['tech', 'problem', 'money'],
    rows: [['Booking', 'Too much back-and-forth', 'Faster appointments'], ['Lead routing', 'Slow response', 'Faster contact'], ['Analytics', "Don't know what works", 'Better decisions']],
  },
  bucket: { type: 'bucket', top: 'TRAFFIC', bottom: 'CUSTOMERS', leaks: ['SLOW', 'CONFUSING', 'NO TRUST', 'BAD CTA', 'LONG FORM', 'SLOW RESPONSE', 'NO FOLLOW-UP'] },
  list: {
    type: 'list',
    items: [{ label: 'ACQUISITION', detail: 'How do people find us?' }, { label: 'CLARITY', detail: 'Do they immediately understand what we do?' }, { label: 'TRUST', detail: 'Why should they believe us?' }],
  },
};

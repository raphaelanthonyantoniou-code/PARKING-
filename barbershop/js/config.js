// Everything a shop owner needs to change lives in this file.
// Prices, hours, barbers and contact details below are placeholders.

export const SHOP = {
  name: 'Barbershop',
  fullName: 'Barbershop Athens',
  established: 2012,
  street: 'Aiolou Street',
  city: 'Athens',
  postcode: '105 51',
  country: 'GR',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Barbershop+Aiolou+Street+Athens',
  phone: '+30 210 000 0000',
  whatsapp: '302100000000', // international format, digits only
  email: 'hello@barbershop.example',
  instagram: 'barbershop.athens',
  timezone: 'Europe/Athens',
  currency: 'EUR',
  locale: 'en-GB',

  // 0 = Sunday … 6 = Saturday. null means closed.
  hours: {
    0: null,
    1: ['10:00', '20:00'],
    2: ['10:00', '20:00'],
    3: ['10:00', '21:00'],
    4: ['10:00', '20:00'],
    5: ['10:00', '20:00'],
    6: ['09:00', '17:00'],
  },

  slotMinutes: 15,
  bookingDays: 14,

  // POST endpoint that receives booking requests as JSON. Leave null to send
  // requests over WhatsApp instead.
  bookingEndpoint: null,

  // Shows a line in the footer saying the content is placeholder. Turn off
  // once real details, prices and reviews are in.
  demo: true,
};

export const SERVICES = [
  {
    id: 'signature',
    name: 'Signature Cut',
    group: 'hair',
    minutes: 45,
    price: 25,
    grade: 'Scissor + clipper',
    text: 'Consultation, cut, wash and a hot towel, styled with matte clay.',
  },
  {
    id: 'fade',
    name: 'Skin Fade',
    group: 'hair',
    minutes: 50,
    price: 28,
    grade: '#0 → #2 · 0–6 mm',
    text: 'Bald to a #2, blended by hand with a foil shaver and razor-lined.',
  },
  {
    id: 'scissor',
    name: 'Scissor Cut',
    group: 'hair',
    minutes: 60,
    price: 32,
    grade: 'Shears only',
    text: 'Longer styles cut entirely with shears. Texture, weight out, blow-dry.',
  },
  {
    id: 'junior',
    name: 'Junior Cut',
    group: 'hair',
    minutes: 30,
    price: 15,
    grade: 'Under 12',
    text: 'Clean, classic cuts for kids, with a little patience built in.',
  },
  {
    id: 'beard',
    name: 'Beard Sculpt',
    group: 'beard',
    minutes: 30,
    price: 18,
    grade: '#1 → shears',
    text: 'Length, shape and cheek line set, razor-lined and finished with oil.',
  },
  {
    id: 'shave',
    name: 'Royal Shave',
    group: 'beard',
    minutes: 45,
    price: 30,
    grade: 'Straight razor',
    text: 'Pre-shave oil, two hot towels at 45 °C, lather, two passes, cold towel, balm.',
  },
  {
    id: 'cutbeard',
    name: 'Cut & Beard',
    group: 'ritual',
    minutes: 75,
    price: 40,
    grade: 'Most booked',
    text: 'A Signature Cut and a Beard Sculpt in one sitting.',
  },
  {
    id: 'ritual',
    name: 'The Full Ritual',
    group: 'ritual',
    minutes: 100,
    price: 65,
    grade: 'Full service',
    text: 'Cut, Royal Shave, charcoal mask, scalp massage and a drink at the bar.',
  },
];

export const GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'hair', label: 'Hair' },
  { id: 'beard', label: 'Beard & shave' },
  { id: 'ritual', label: 'Rituals' },
];

export const BARBERS = [
  {
    id: 'nikos',
    name: 'Nikos',
    role: 'Founder · Master barber',
    years: 16,
    skills: ['Classic scissor cuts', 'Straight-razor shaves', 'Side partings'],
    daysOff: [1], // Monday
    quote: 'A good cut grows out well. That is the whole test.',
    tone: '#8a5a2b',
  },
  {
    id: 'elena',
    name: 'Elena',
    role: 'Senior barber',
    years: 9,
    skills: ['Skin fades', 'Textured crops', 'Curly hair'],
    daysOff: [2],
    quote: 'I check the blend in three lights before you stand up.',
    tone: '#2c6f73',
  },
  {
    id: 'stavros',
    name: 'Stavros',
    role: 'Beard specialist',
    years: 7,
    skills: ['Beard sculpting', 'Hot towel rituals', 'Grey blending'],
    daysOff: [4],
    quote: 'The neckline decides whether a beard looks kept or grown.',
    tone: '#7a2620',
  },
  {
    id: 'leo',
    name: 'Leo',
    role: 'Barber',
    years: 4,
    skills: ['Modern fades', 'Junior cuts', 'Hair designs'],
    daysOff: [3],
    quote: 'Bring a photo. Then let me tell you what will suit you.',
    tone: '#5b5f2a',
  },
];

export const REVIEWS = [
  { name: 'Giorgos P.', service: 'Skin Fade', text: 'Cleanest fade I have had in Athens. Elena checked it from every angle before I left.' },
  { name: 'Mark T.', service: 'Royal Shave', text: 'Two hot towels, two passes and not a single nick. I booked the next one at the desk.' },
  { name: 'Andreas K.', service: 'Cut & Beard', text: 'They actually listen. I said keep the length and they kept the length.' },
  { name: 'Sofia L.', service: 'Junior Cut', text: 'My son sat still for thirty minutes. Leo made it a game and the cut is great.' },
  { name: 'Yannis D.', service: 'The Full Ritual', text: 'Worth every euro. The scalp massage alone fixed my week.' },
  { name: 'Chris M.', service: 'Signature Cut', text: 'On time, no rushing, and the cut still looks right three weeks later.' },
];

export const FAQ = [
  {
    q: 'Do you take walk-ins?',
    a: 'Yes, when a chair is free. Weekday mornings are the quietest. Booking guarantees your time.',
  },
  {
    q: 'What if I am running late?',
    a: 'Message us. We hold your chair for 10 minutes; after that we may need to shorten the service or move you.',
  },
  {
    q: 'Can I cancel or move my booking?',
    a: 'Free of charge up to 2 hours before. Message us on WhatsApp or call the shop.',
  },
  {
    q: 'How do I pay?',
    a: 'Card, Apple Pay, Google Pay or cash. Tips go straight to your barber.',
  },
];

// The shelf: products clients can add to their visit and pay for at the shop.
export const PRODUCTS = [
  { id: 'clay', name: 'Matte Clay', size: '100 ml', price: 18, text: 'Strong hold, no shine. What we finish most cuts with.' },
  { id: 'pomade', name: 'Classic Pomade', size: '100 g', price: 17, text: 'Water-based, medium shine, washes out clean.' },
  { id: 'oil', name: 'Beard Oil', size: '30 ml', price: 16, text: 'Cedar and bergamot. Softens the beard and the skin under it.' },
  { id: 'tonic', name: 'Bay Rum Tonic', size: '100 ml', price: 22, text: 'The aftershave we splash on after every Royal Shave.' },
  { id: 'cream', name: 'Shave Cream', size: '150 ml', price: 15, text: 'Thick lather from a few drops. Made for a brush.' },
  { id: 'comb', name: 'Pocket Comb', size: '13 cm', price: 9, text: 'Saw-cut acetate teeth that glide instead of pulling.' },
];

// Memberships, paid monthly at the shop. Joining sends a WhatsApp message.
export const MEMBERSHIPS = [
  {
    id: 'regular',
    name: 'The Regular',
    price: 22,
    perks: ['One Signature Cut a month', 'Priority on Saturday slots', '10% off the shelf'],
  },
  {
    id: 'sharp',
    name: 'The Sharp',
    price: 42,
    featured: true,
    perks: ['Two cuts a month', 'One Beard Sculpt a month', 'Free neck line-ups between visits', '15% off the shelf'],
  },
  {
    id: 'club',
    name: 'The After Hours',
    price: 70,
    perks: ['Two cuts and one Royal Shave a month', 'Free line-ups any time', 'Book after closing on Thursdays', '20% off the shelf'],
  },
];

export const GIFT_AMOUNTS = [25, 40, 65, 100];

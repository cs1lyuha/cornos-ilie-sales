// Route of the day. Mirrors the demo STOPS in ../App.tsx (kept in sync by hand).
const STOPS = [
  {
    id: 'stop-1',
    customer: 'La Plăcinte Centru',
    address: 'Bd. Ștefan cel Mare 64',
    items: ['Apă minerală 0.5L × 4', 'Cafea boabe 1kg × 2', 'Șervețele horeca × 5'],
    total: 842,
    status: 'pending',
  },
  {
    id: 'stop-2',
    customer: 'Andy’s Pizza Botanica',
    address: 'Str. Independenței 12',
    items: ['Bere blondă 0.5L × 6', 'Suc de mere 1L × 3'],
    total: 1220,
    status: 'pending',
  },
  {
    id: 'stop-3',
    customer: 'Coffee Break',
    address: 'Str. București 33',
    items: ['Cafea boabe 1kg × 3', 'Șervețele horeca × 2'],
    total: 716,
    status: 'pending',
  },
];

module.exports = { STOPS };

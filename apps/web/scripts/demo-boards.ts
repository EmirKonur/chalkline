import type { Ink, ShapeInit, Size } from '@chalkline/core';

/**
 * Hand-placed demo content: a system design sketch and a sprint retro. Pen
 * strokes are generated from a seeded random source so the "handwriting" is
 * identical on every run.
 */

type Pt = [number, number];

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pen(points: Pt[], ink: Ink, size: Size, rnd: () => number): ShapeInit {
  const [ox, oy] = points[0] ?? [0, 0];
  const flat: number[] = [];
  for (const [x, y] of points) flat.push(x - ox, y - oy, 0.45 + rnd() * 0.2);
  return { kind: 'pen', x: ox, y: oy, points: flat, realPressure: false, sx: 1, sy: 1, ink, size };
}

/** A loose hand-drawn loop that overshoots its start, like a real circled word. */
export function handLoop(cx: number, cy: number, rx: number, ry: number, rnd: () => number): Pt[] {
  const out: Pt[] = [];
  const start = -2.2 + rnd() * 0.3;
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * Math.PI * 2.18;
    const wobble = 1 + Math.sin(t * 3 + rnd()) * 0.025 + (rnd() - 0.5) * 0.012;
    out.push([cx + Math.cos(t) * rx * wobble, cy + Math.sin(t) * ry * wobble + i * 0.12]);
  }
  return out;
}

export function handLine(from: Pt, to: Pt, rnd: () => number, sag = 0): Pt[] {
  const out: Pt[] = [];
  const steps = Math.max(8, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([
      from[0] + (to[0] - from[0]) * t + (rnd() - 0.5) * 1.2,
      from[1] + (to[1] - from[1]) * t + Math.sin(t * Math.PI) * sag + (rnd() - 0.5) * 1.2,
    ]);
  }
  return out;
}

function check(x: number, y: number, s: number, rnd: () => number): Pt[] {
  return [
    ...handLine([x, y], [x + s * 0.35, y + s * 0.4], rnd),
    ...handLine([x + s * 0.35, y + s * 0.4], [x + s, y - s * 0.55], rnd).slice(1),
  ];
}

function star(cx: number, cy: number, r: number, rnd: () => number): Pt[] {
  const corners: Pt[] = [];
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    corners.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const out: Pt[] = [];
  for (let i = 1; i < corners.length; i++)
    out.push(...handLine(corners[i - 1] as Pt, corners[i] as Pt, rnd).slice(i === 1 ? 0 : 1));
  return out;
}

function box(
  x: number,
  y: number,
  w: number,
  h: number,
  ink: Ink,
  title: string,
  caption: string,
  fill: 'none' | 'tint' = 'none',
): ShapeInit[] {
  return [
    { kind: 'rect', x, y, w, h, fill, ink, size: 'm' },
    { kind: 'text', x: x + 18, y: y + 16, text: title, scale: 1, ink, size: 'm' },
    { kind: 'text', x: x + 18, y: y + 54, text: caption, scale: 1, ink: 'chalk', size: 's' },
  ];
}

function arrow(from: Pt, to: Pt, ink: Ink = 'chalk'): ShapeInit {
  return {
    kind: 'arrow',
    x: from[0],
    y: from[1],
    dx: to[0] - from[0],
    dy: to[1] - from[1],
    ink,
    size: 'm',
  };
}

function sticky(x: number, y: number, ink: Ink, text: string): ShapeInit {
  return { kind: 'sticky', x, y, w: 210, h: 190, text, ink, size: 'm' };
}

/** Someone sketching the order flow for a checkout rewrite, mid design review. */
export function systemDesign(): { title: string; shapes: ShapeInit[] } {
  const rnd = seeded(14);
  const shapes: ShapeInit[] = [
    {
      kind: 'text',
      x: 0,
      y: -40,
      text: 'Checkout v2: order flow',
      scale: 1,
      ink: 'chalk',
      size: 'xl',
    },
    pen(handLine([4, 40], [560, 34], rnd, 4), 'butter', 'm', rnd),
    {
      kind: 'text',
      x: 0,
      y: 62,
      text: 'design review, sprint 14',
      scale: 1,
      ink: 'lilac',
      size: 's',
    },

    ...box(0, 220, 210, 110, 'sky', 'Web + iOS', 'cart, address, pay'),
    ...box(330, 220, 220, 110, 'chalk', 'API gateway', 'auth, rate limits'),
    ...box(680, 180, 260, 190, 'butter', 'Checkout svc', 'orders, pricing,\nidempotency'),
    ...box(1080, 80, 230, 110, 'mint', 'Payments', 'Stripe adapter'),
    ...box(1080, 320, 230, 110, 'mint', 'Inventory', 'reserve, release'),
    ...box(1080, 560, 250, 110, 'peach', 'order-events', 'Kafka, 12 partitions'),
    { kind: 'ellipse', x: 690, y: 500, w: 240, h: 120, fill: 'none', ink: 'sky', size: 'm' },
    { kind: 'text', x: 752, y: 540, text: 'Postgres', scale: 1, ink: 'sky', size: 'm' },
    {
      kind: 'text',
      x: 380,
      y: 590,
      text: 'read replica\nfor order history?',
      scale: 1,
      ink: 'lilac',
      size: 's',
    },
    arrow([592, 616], [680, 580], 'lilac'),

    arrow([214, 275], [322, 275]),
    arrow([556, 275], [672, 275]),
    arrow([946, 230], [1072, 140]),
    arrow([946, 290], [1072, 370]),
    arrow([946, 345], [1072, 600]),
    arrow([810, 376], [810, 492], 'sky'),

    pen(handLoop(1195, 375, 165, 90, rnd), 'pink', 'm', rnd),
    { kind: 'text', x: 1210, y: 478, text: 'hot path?', scale: 1, ink: 'pink', size: 's' },
    pen(check(1328, 112, 34, rnd), 'mint', 'l', rnd),

    sticky(1440, 40, 'butter', 'Idempotency key on every POST /orders'),
    sticky(1440, 270, 'pink', 'p99 budget: 300 ms end to end'),
    sticky(1440, 500, 'sky', 'Who owns refunds? Ask the payments team'),
  ];
  return { title: 'Checkout v2 design', shapes };
}

/** A retro board after the team has filled it in. */
export function retro(): { title: string; shapes: ShapeInit[] } {
  const rnd = seeded(7);
  const columns: { title: string; ink: Ink; notes: string[] }[] = [
    {
      title: 'Went well',
      ink: 'mint',
      notes: [
        'Offline mode shipped a week early',
        'Pairing on the sync server',
        'Zero pages this sprint',
      ],
    },
    {
      title: 'Could be better',
      ink: 'pink',
      notes: ['Flaky e2e on CI', 'Too many meetings on Tuesday', 'Design review came late'],
    },
    {
      title: 'Try next',
      ink: 'butter',
      notes: ['Demo every Friday', 'Rotate on-call earlier', 'Write ADRs before coding'],
    },
  ];
  const shapes: ShapeInit[] = [
    { kind: 'text', x: 0, y: -70, text: 'Sprint 14 retro', scale: 1, ink: 'chalk', size: 'xl' },
  ];
  columns.forEach((column, c) => {
    const x = c * 520;
    shapes.push({
      kind: 'text',
      x,
      y: 30,
      text: column.title,
      scale: 1,
      ink: column.ink,
      size: 'l',
    });
    shapes.push(pen(handLine([x, 86], [x + 300, 82], rnd, 3), column.ink, 's', rnd));
    column.notes.forEach((note, i) => {
      shapes.push(sticky(x + (i % 2) * 240, 130 + Math.floor(i / 2) * 230, column.ink, note));
    });
  });
  shapes.push(pen(star(1240, 600, 34, rnd), 'butter', 'm', rnd));
  shapes.push(pen(star(160, 600, 26, rnd), 'mint', 'm', rnd));
  shapes.push({
    kind: 'text',
    x: 620,
    y: 590,
    text: '+1 from four people',
    scale: 1,
    ink: 'pink',
    size: 's',
  });
  shapes.push(arrow([610, 610], [534, 560], 'pink'));
  return { title: 'Sprint 14 retro', shapes };
}

export const DEMO_BOARDS = { 'system-design': systemDesign, retro } as const;
export type DemoBoard = keyof typeof DEMO_BOARDS;

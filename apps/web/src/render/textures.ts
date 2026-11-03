export const GRAIN_TILE = 160;

/**
 * Speckle tile knocked out of the ink with `destination-out`, which is what
 * makes flat strokes read as chalk. Generated once with a seeded generator
 * so every client (and every export) gets the same grain.
 */
export function createGrainTile(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_TILE;
  canvas.height = GRAIN_TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  let seed = 0x2f6b9a1d;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10_000) / 10_000;
  };
  for (let i = 0; i < image.data.length; i += 4) {
    const r = random();
    image.data[i + 3] = r < 0.55 ? 0 : Math.round(((r - 0.55) / 0.45) ** 1.6 * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** One grid cell with a dot in the middle, sized in device pixels. */
export function createGridTile(
  sizePx: number,
  dotRadiusPx: number,
  color: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sizePx / 2, sizePx / 2, dotRadiusPx, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

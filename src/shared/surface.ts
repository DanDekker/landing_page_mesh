// Six regular patches with shared edge and corner vertices. No pole fans.
export const SURFACE_GRID = 35;
export const SURFACE_SLOTS = 6 * SURFACE_GRID * SURFACE_GRID;

function buildSurface() {
  const n = SURFACE_GRID, middle = (n - 1) / 2, patch = n * n;
  const coordinates = new Int16Array(SURFACE_SLOTS * 3);
  const canonical = new Uint16Array(SURFACE_SLOTS);
  const neighbors = new Uint16Array(SURFACE_SLOTS * 4);
  const uv = new Float32Array(SURFACE_SLOTS * 2);
  const points: number[] = [], edges: number[] = [];
  const vertices = new Map<number, number>(), connections = new Set<number>();
  for (let face = 0; face < 6; face++) {
    for (let row = 0; row < n; row++) for (let column = 0; column < n; column++) {
      const slot = face * patch + row * n + column, a = column - middle, b = row - middle;
      const p = face === 0 ? [middle, b, -a] : face === 1 ? [-middle, b, a] : face === 2 ? [a, middle, -b] : face === 3 ? [a, -middle, b] : face === 4 ? [a, b, middle] : [-a, b, -middle];
      coordinates.set(p, slot * 3);
      const key = (p[0]! + middle) * n * n + (p[1]! + middle) * n + p[2]! + middle;
      let index = vertices.get(key);
      if (index === undefined) { index = slot; vertices.set(key, index); points.push(index); }
      canonical[slot] = index;
      uv[slot * 2] = column / (n - 1); uv[slot * 2 + 1] = row / (n - 1);
    }
  }
  const vertex = (face: number, row: number, column: number) => canonical[face * patch + Math.max(0, Math.min(n - 1, row)) * n + Math.max(0, Math.min(n - 1, column))]!;
  const connect = (a: number, b: number) => {
    if (a === b) return;
    const key = Math.min(a, b) * SURFACE_SLOTS + Math.max(a, b);
    if (!connections.has(key)) { connections.add(key); edges.push(a, b); }
  };
  for (let face = 0; face < 6; face++) {
    for (let row = 0; row < n; row++) for (let column = 0; column < n; column++) {
      const slot = face * patch + row * n + column, a = canonical[slot]!;
      neighbors.set([vertex(face, row, column - 1), vertex(face, row, column + 1), vertex(face, row - 1, column), vertex(face, row + 1, column)], slot * 4);
      if (column + 1 < n) connect(a, vertex(face, row, column + 1));
      if (row + 1 < n) connect(a, vertex(face, row + 1, column));
      if (row + 1 < n && column + 1 < n && (row + column) % 2 === 0) connect(a, vertex(face, row + 1, column + 1));
    }
  }
  return { coordinates, canonical, neighbors, uv, points: new Uint16Array(points), edges: new Uint16Array(edges) };
}

export const SURFACE = buildSurface();

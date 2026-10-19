export type Form = 'silk' | 'orbit' | 'wave' | 'knot' | 'sphere' | 'cube' | 'pyramid';
export type Palette = 'alpine';
export type FieldSettings = { form: Form; turbulence: number; tension: number; paused: boolean; palette: Palette };
export type Pointer = { x: number; y: number; z: number; active: boolean; down: boolean; index?: number };
export type WheelKick = { delta: number; x: number; y: number; z: number };
export const ROWS = 192;
export const COLUMNS = 40;
export const COUNT = ROWS * COLUMNS;
export const HZ = 77;
export const DEFAULT_SETTINGS: FieldSettings = { form: 'silk', turbulence: .32, tension: .65, paused: false, palette: 'alpine' };
export const FORMS: Form[] = ['silk', 'orbit', 'wave', 'knot', 'sphere', 'cube', 'pyramid'];
export const PALETTES: Palette[] = ['alpine'];
export const IDLE_POINTER: Pointer = { x: 0, y: 0, z: 0, active: false, down: false };

export function normalizeSettings(input: Partial<FieldSettings>, previous = DEFAULT_SETTINGS): FieldSettings {
  const unit = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  return {
    form: FORMS.includes(input.form!) ? input.form! : previous.form,
    turbulence: unit(input.turbulence, previous.turbulence),
    tension: unit(input.tension, previous.tension),
    paused: typeof input.paused === 'boolean' ? input.paused : previous.paused,
    palette: PALETTES.includes(input.palette!) ? input.palette! : previous.palette,
  };
}

// Original presentation geometry. No engine source or engine assets are used.
export function writeShape(target: Float32Array, form: Form, time = 0, torsion = 0): void {
  const tau = Math.PI * 2;
  for (let row = 0; row < ROWS; row++) {
    const u = row / (form === 'wave' ? ROWS - 1 : ROWS) * tau;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let column = 0; column < COLUMNS; column++) {
      const v = column / (form === 'orbit' ? COLUMNS : COLUMNS - 1) * 2 - 1;
      const at = (row * COLUMNS + column) * 3;
      if (form === 'silk') {
        const twist = u + .2 * Math.sin(time * .17) + torsion * Math.sin(u);
        const width = v * (.66 + .1 * Math.cos(u * 3 + time * .11));
        const radius = 1.48 + width * Math.cos(twist);
        target[at] = radius * cu;
        target[at + 1] = width * Math.sin(twist) + .22 * Math.sin(u * 2 + time * .15);
        target[at + 2] = radius * su;
      } else if (form === 'orbit') {
        const angle = v * Math.PI + torsion * Math.sin(u) * 1.2;
        const tube = .39 + .06 * Math.sin(u * 3 + time * .2);
        const radius = 1.24 + tube * Math.cos(angle);
        target[at] = radius * cu;
        target[at + 1] = tube * Math.sin(angle) + .32 * Math.sin(u * 3 + time * .12) + torsion * .12 * Math.sin(u * 2);
        target[at + 2] = radius * su;
      } else if (form === 'knot') {
        const twist = u * 2 + torsion * Math.sin(u) + .15 * Math.sin(time * .16);
        const width = v * (.24 + .025 * Math.sin(u * 2 + time * .14));
        const radius = 1.05 + .36 * Math.cos(u * 3) + width * Math.cos(twist);
        target[at] = radius * Math.cos(u * 2);
        target[at + 1] = .5 * Math.sin(u * 3) + width * Math.sin(twist);
        target[at + 2] = radius * Math.sin(u * 2);
      } else if (isCapped(form)) {
        let x: number, y: number, z: number;
        if (form === 'sphere') {
          const latitude = v * Math.PI * .5, radius = Math.cos(latitude) * 1.36;
          x = radius * cu; y = Math.sin(latitude) * 1.36; z = radius * su;
        } else {
          const side = row / ROWS * 4, edge = Math.floor(side), t = (side - edge) * 2 - 1;
          const px = edge === 0 ? 1 : edge === 1 ? -t : edge === 2 ? -1 : t;
          const pz = edge === 0 ? t : edge === 1 ? 1 : edge === 2 ? -t : -1;
          let radius: number;
          if (form === 'cube') {
            radius = column <= 8 ? column / 8 : column >= 31 ? (COLUMNS - 1 - column) / 8 : 1;
            y = column <= 8 ? -1.04 : column >= 31 ? 1.04 : (column - 8) / 23 * 2.08 - 1.04;
            x = px * radius * 1.04; z = pz * radius * 1.04;
          } else {
            const height = Math.max(0, (column - 8) / (COLUMNS - 1 - 8));
            radius = column <= 8 ? column / 8 : 1 - height;
            y = -.84 + height * 2.35;
            x = px * radius * 1.22; z = pz * radius * 1.22;
          }
        }
        const twist = torsion * y * .8;
        target[at] = x * Math.cos(twist) - z * Math.sin(twist);
        target[at + 1] = y;
        target[at + 2] = x * Math.sin(twist) + z * Math.cos(twist);
      } else {
        const a = (row / (ROWS - 1) * 2 - 1) * 2.25;
        const b = v * 1.18;
        const height = .38 * Math.sin(a * 2.1 + b * 1.2 + time * .22) + .17 * Math.cos(b * 3 - a + time * .18);
        const twist = torsion * a * .8;
        target[at] = a;
        target[at + 1] = height * Math.cos(twist) - b * Math.sin(twist);
        target[at + 2] = height * Math.sin(twist) + b * Math.cos(twist);
      }
    }
  }
}

export function isCapped(form: Form) { return form === 'sphere' || form === 'cube' || form === 'pyramid'; }

export function pointIndices(form: Form): Uint16Array {
  const indices: number[] = [];
  for (let row = 0; row < ROWS; row++) for (let column = 0; column < COLUMNS; column++) {
    if (isCapped(form) && row > 0 && (column === 0 || column === COLUMNS - 1)) continue;
    indices.push(row * COLUMNS + column);
  }
  return new Uint16Array(indices);
}

export function gridIndex(form: Form, row: number, column: number): number {
  const r = form === 'wave' ? Math.max(0, Math.min(ROWS - 1, row)) : (row + ROWS) % ROWS;
  const c = form === 'orbit' ? (column + COLUMNS) % COLUMNS : Math.max(0, Math.min(COLUMNS - 1, column));
  if (isCapped(form) && (c === 0 || c === COLUMNS - 1)) return c;
  return r * COLUMNS + c;
}

export function createEdges(form: Form = 'silk'): Uint16Array {
  const edges: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const i = row * COLUMNS + column;
      if (isCapped(form) && column === 0) { edges.push(0, row * COLUMNS + 1); continue; }
      if (isCapped(form) && column === COLUMNS - 1) continue;
      const nextRow = row + 1 < ROWS || form !== 'wave';
      const nextColumn = column + 1 < COLUMNS || form === 'orbit';
      if (nextRow) edges.push(i, gridIndex(form, row + 1, column));
      if (nextColumn) edges.push(i, gridIndex(form, row, column + 1));
      if (nextRow && nextColumn && (!isCapped(form) || column < COLUMNS - 2) && (row + column) % 2 === 0) edges.push(i, gridIndex(form, row + 1, column + 1));
    }
  }
  return new Uint16Array(edges);
}

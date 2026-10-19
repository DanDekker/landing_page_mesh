export type Form = 'silk' | 'orbit' | 'wave';
export type Palette = 'copper' | 'silver' | 'glacial';
export type FieldSettings = { form: Form; turbulence: number; tension: number; paused: boolean; palette: Palette };
export type Pointer = { x: number; y: number; z: number; active: boolean; down: boolean };
export const ROWS = 192;
export const COLUMNS = 40;
export const COUNT = ROWS * COLUMNS;
export const HZ = 77;
export const DEFAULT_SETTINGS: FieldSettings = { form: 'silk', turbulence: .32, tension: .65, paused: false, palette: 'copper' };
export const FORMS: Form[] = ['silk', 'orbit', 'wave'];
export const PALETTES: Palette[] = ['copper', 'silver', 'glacial'];
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
export function writeShape(target: Float32Array, form: Form, time = 0): void {
  const tau = Math.PI * 2;
  for (let row = 0; row < ROWS; row++) {
    const u = row / (ROWS - 1) * tau;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let column = 0; column < COLUMNS; column++) {
      const v = column / (COLUMNS - 1) * 2 - 1;
      const at = (row * COLUMNS + column) * 3;
      if (form === 'silk') {
        const twist = u * 1.5 + .2 * Math.sin(time * .17);
        const width = v * (.66 + .1 * Math.cos(u * 3 + time * .11));
        const radius = 1.48 + width * Math.cos(twist);
        target[at] = radius * cu;
        target[at + 1] = width * Math.sin(twist) + .22 * Math.sin(u * 2 + time * .15);
        target[at + 2] = radius * su;
      } else if (form === 'orbit') {
        const angle = v * Math.PI;
        const tube = .39 + .06 * Math.sin(u * 3 + time * .2);
        const radius = 1.24 + tube * Math.cos(angle);
        target[at] = radius * cu;
        target[at + 1] = tube * Math.sin(angle) + .32 * Math.sin(u * 3 + time * .12);
        target[at + 2] = radius * su;
      } else {
        const a = (row / (ROWS - 1) * 2 - 1) * 2.25;
        const b = v * 1.18;
        target[at] = a;
        target[at + 1] = .38 * Math.sin(a * 2.1 + b * 1.2 + time * .22) + .17 * Math.cos(b * 3 - a + time * .18);
        target[at + 2] = b;
      }
    }
  }
}

export function createEdges(): Uint16Array {
  const edges: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const i = row * COLUMNS + column;
      if (row + 1 < ROWS) edges.push(i, i + COLUMNS);
      if (column + 1 < COLUMNS) edges.push(i, i + 1);
      if (row + 1 < ROWS && column + 1 < COLUMNS && (row + column) % 2 === 0) edges.push(i, i + COLUMNS + 1);
    }
  }
  return new Uint16Array(edges);
}

import { COUNT, ROWS, COLUMNS, HZ, DEFAULT_SETTINGS, IDLE_POINTER, normalizeSettings, writeShape, createEdges, isSurface, type FieldSettings, type Pointer, type WheelKick } from '../shared/field.ts';

// Standalone, original browser fallback. It is independent of the optional
// proprietary server provider. Standard mass/spring projection only.
export class Simulation {
  readonly positions = new Float32Array(COUNT * 3);
  readonly velocities = new Float32Array(COUNT * 3);
  readonly anchors = new Float32Array(COUNT * 3);
  readonly desired = new Float32Array(COUNT * 3);
  readonly previous = new Float32Array(COUNT * 3);
  edges = createEdges();
  lengths = new Float32Array(this.edges.length / 2);
  settings: FieldSettings = { ...DEFAULT_SETTINGS };
  pointer: Pointer = { ...IDLE_POINTER };
  time = 0;
  ticks = 0;
  torsion = 0;
  private torsionVelocity = 0;
  private pulses: { x: number; y: number; z: number; age: number; force: number }[] = [];

  constructor(settings?: Partial<FieldSettings>) {
    this.configure(settings ?? {});
    this.reset();
  }

  configure(settings: Partial<FieldSettings>) {
    const previousForm = this.settings.form;
    this.settings = normalizeSettings(settings, this.settings);
    if (previousForm !== this.settings.form) {
      this.edges = createEdges(this.settings.form);
      this.lengths = new Float32Array(this.edges.length / 2);
      this.reset(false);
    }
  }

  reset(restartClock = true) {
    if (restartClock) { this.time = 0; this.ticks = 0; }
    this.torsion = 0; this.torsionVelocity = 0;
    this.pulses.length = 0;
    writeShape(this.positions, this.settings.form, this.time);
    this.anchors.set(this.positions);
    this.desired.set(this.positions);
    this.velocities.fill(0);
    this.updateLengths();
  }

  pulse(x: number, y: number, z: number, force = 1) {
    if (![x, y, z, force].every(Number.isFinite)) return;
    if (this.pulses.length >= 6) this.pulses.shift();
    this.pulses.push({ x, y, z, age: 0, force: Math.max(0, Math.min(2, force)) });
  }

  swirl(kick: WheelKick) {
    if (![kick.delta, kick.x, kick.y, kick.z].every(Number.isFinite)) return;
    const strength = Math.max(-.8, Math.min(.8, kick.delta)) * 1.6;
    this.torsionVelocity = Math.max(-7, Math.min(7, this.torsionVelocity + kick.delta * 7));
    for (let i = 0; i < COUNT; i++) {
      const at = i * 3, x = this.positions[at]!, y = this.positions[at + 1]!, z = this.positions[at + 2]!;
      const twist = .25 + .75 * Math.sin(Math.floor(i / COLUMNS) / ROWS * Math.PI * 2);
      this.velocities[at] += (kick.y * z - kick.z * y) * strength * twist;
      this.velocities[at + 1] += (kick.z * x - kick.x * z) * strength * twist;
      this.velocities[at + 2] += (kick.x * y - kick.y * x) * strength * twist;
    }
  }

  private updateLengths() {
    const p = this.anchors;
    for (let e = 0; e < this.lengths.length; e++) {
      const a = this.edges[e * 2]! * 3, b = this.edges[e * 2 + 1]! * 3;
      this.lengths[e] = Math.hypot(p[a]! - p[b]!, p[a + 1]! - p[b + 1]!, p[a + 2]! - p[b + 2]!);
    }
  }

  step() {
    if (this.settings.paused) return;
    const dt = 1 / HZ, p = this.positions, velocity = this.velocities;
    const { turbulence, tension } = this.settings;
    this.time += dt;
    this.ticks++;
    this.torsionVelocity = (this.torsionVelocity - this.torsion * .8 * dt) * Math.exp(-dt * 1.6);
    this.torsion = Math.max(-2.8, Math.min(2.8, this.torsion + this.torsionVelocity * dt));
    writeShape(this.desired, this.settings.form, this.time, this.torsion);
    for (let i = 0; i < p.length; i++) this.anchors[i] += (this.desired[i]! - this.anchors[i]!) * .025;
    this.updateLengths();
    this.previous.set(p);
    const t = this.time * .34;
    const restore = 9 + tension * 14;
    const damping = Math.exp(-(1.5 + tension * 1.1) * dt);
    for (let i = 0; i < COUNT; i++) {
      const a = i * 3, x = p[a]!, y = p[a + 1]!, z = p[a + 2]!;
      let fx = (this.anchors[a]! - x) * restore + (Math.sin(y * 2.3 + t) + Math.cos(z * 1.7 - t * .7)) * turbulence * .65;
      let fy = (this.anchors[a + 1]! - y) * restore + (Math.sin(z * 2.1 + t * .8) - Math.cos(x * 1.8 + t)) * turbulence * .65;
      let fz = (this.anchors[a + 2]! - z) * restore + (Math.sin(x * 1.9 - t) + Math.cos(y * 2 + t * .5)) * turbulence * .65;
      const grabbed = this.pointer.index ?? -1;
      if (this.pointer.down && grabbed >= 0 && grabbed < COUNT) {
        let dr = Math.abs(Math.floor(i / COLUMNS) - Math.floor(grabbed / COLUMNS));
        let dc = Math.abs(i % COLUMNS - grabbed % COLUMNS);
        if (this.settings.form !== 'wave') dr = Math.min(dr, ROWS - dr);
        if (this.settings.form === 'orbit') dc = Math.min(dc, COLUMNS - dc);
        const anchor = grabbed * 3;
        const distance = isSurface(this.settings.form)
          ? ((this.anchors[a]! - this.anchors[anchor]!) ** 2 + (this.anchors[a + 1]! - this.anchors[anchor + 1]!) ** 2 + (this.anchors[a + 2]! - this.anchors[anchor + 2]!) ** 2) / .14
          : dr * dr / 55 + dc * dc / 13;
        const weight = Math.exp(-distance) * 180;
        fx += (this.anchors[a]! + this.pointer.x - this.anchors[anchor]! - x) * weight;
        fy += (this.anchors[a + 1]! + this.pointer.y - this.anchors[anchor + 1]! - y) * weight;
        fz += (this.anchors[a + 2]! + this.pointer.z - this.anchors[anchor + 2]! - z) * weight;
      } else if (this.pointer.active) {
        const dx = x - this.pointer.x, dy = y - this.pointer.y, dz = z - this.pointer.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const influence = Math.exp(-d2 * 2.2) * (this.pointer.down ? -25 : 7);
        fx += dx * influence; fy += dy * influence; fz += dz * influence;
      }
      for (const pulse of this.pulses) {
        const dx = x - pulse.x, dy = y - pulse.y, dz = z - pulse.z;
        const distance = Math.hypot(dx, dy, dz) + .001;
        const shell = distance - pulse.age * 2.9;
        const influence = Math.exp(-shell * shell * 20 - pulse.age * 2.2) * pulse.force * 33 / distance;
        fx += dx * influence; fy += dy * influence; fz += dz * influence;
      }
      velocity[a] = (velocity[a]! + fx * dt) * damping;
      velocity[a + 1] = (velocity[a + 1]! + fy * dt) * damping;
      velocity[a + 2] = (velocity[a + 2]! + fz * dt) * damping;
      p[a] += velocity[a]! * dt;
      p[a + 1] += velocity[a + 1]! * dt;
      p[a + 2] += velocity[a + 2]! * dt;
    }
    const stiffness = .22 + tension * .38;
    for (let iteration = 0; iteration < 2; iteration++) {
      for (let edge = 0; edge < this.lengths.length; edge++) {
        const a = this.edges[edge * 2]! * 3, b = this.edges[edge * 2 + 1]! * 3;
        const dx = p[b]! - p[a]!, dy = p[b + 1]! - p[a + 1]!, dz = p[b + 2]! - p[a + 2]!;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-8;
        const correction = (length - this.lengths[edge]!) / length * stiffness * .5;
        p[a] += dx * correction; p[a + 1] += dy * correction; p[a + 2] += dz * correction;
        p[b] -= dx * correction; p[b + 1] -= dy * correction; p[b + 2] -= dz * correction;
      }
    }
    for (let i = 0; i < p.length; i++) {
      if (!Number.isFinite(p[i]!) || Math.abs(p[i]!) > 10) { p[i] = this.anchors[i]!; velocity[i] = 0; }
      else velocity[i] = (p[i]! - this.previous[i]!) / dt;
    }
    for (const pulse of this.pulses) pulse.age += dt;
    this.pulses = this.pulses.filter(pulse => pulse.age < 2);
  }
}

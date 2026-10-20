const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function wheelDelta(deltaY: number, deltaMode: number, height: number) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? height : 1);
  return clamp(-pixels * .0045, .55);
}

// Presentation motion only: a bounded, damped torsion spring.
export class WheelMotion {
  amount = 0;
  private velocity = 0;
  private energy = 0;

  kick(delta: number) {
    delta = clamp(delta, .55);
    if (delta * this.velocity < 0) this.velocity = 0;
    const before = this.velocity;
    this.velocity = clamp(before + delta * 11, 9);
    const impulse = (this.velocity - before) / 11;
    this.amount = clamp(this.amount + impulse * .5, 2.4);
    this.energy = Math.min(1, this.energy + Math.abs(delta) * 3);
    return impulse;
  }

  step(dt: number) {
    this.velocity = (this.velocity - this.amount * 12 * dt) * Math.exp(-dt * 4.5);
    this.amount = clamp(this.amount + this.velocity * dt, 2.4);
    this.energy *= Math.exp(-dt * 9);
  }

  get followRate() { return 2.3 + this.energy * 20 + Math.min(1, Math.abs(this.velocity)) * 8; }

  reset() { this.amount = 0; this.velocity = 0; this.energy = 0; }
}

import { describe, expect, test } from 'bun:test';
import { Simulation } from '../src/physics/simulation.ts';
import { COUNT, FORMS, HZ, createEdges, normalizeSettings, writeShape } from '../src/shared/field.ts';

describe('field geometry', () => {
  test('all forms fit the same valid topology', () => {
    const edges = createEdges();
    expect(edges.length % 2).toBe(0);
    for (const index of edges) expect(index).toBeLessThan(COUNT);
    for (const form of FORMS) {
      const positions = new Float32Array(COUNT * 3); writeShape(positions, form);
      expect(positions.every(value => Number.isFinite(value) && Math.abs(value) < 3)).toBe(true);
    }
  });

  test('settings reject invalid values without losing prior state', () => {
    expect(normalizeSettings({ turbulence: Infinity, tension: -4, form: 'unknown' as never })).toMatchObject({ turbulence: .32, tension: 0, form: 'silk' });
  });
});

describe('standalone simulation', () => {
  test('motion is deterministic and pause preserves state', () => {
    const a = new Simulation(), b = new Simulation();
    for (let i = 0; i < 20; i++) { a.step(); b.step(); }
    expect(a.positions).toEqual(b.positions);
    const before = a.positions.slice(), time = a.time;
    a.configure({ paused: true }); a.step();
    expect(a.positions).toEqual(before); expect(a.time).toBe(time);
  });

  test('pointer impulses move the mesh and reset restores it', () => {
    const a = new Simulation(), b = new Simulation();
    a.pulse(1.3, .1, .1);
    for (let i = 0; i < 25; i++) { a.step(); b.step(); }
    let difference = 0;
    for (let i = 0; i < a.positions.length; i++) difference += Math.abs(a.positions[i]! - b.positions[i]!);
    expect(difference).toBeGreaterThan(.5);
    a.reset(); b.reset(); expect(a.positions).toEqual(b.positions);
  });

  test('strong forces and form changes remain bounded', () => {
    const simulation = new Simulation({ turbulence: 1, tension: 1 });
    for (const form of FORMS) {
      simulation.configure({ form });
      simulation.pointer = { x: .7, y: .3, z: .1, active: true, down: true };
      simulation.pulse(.7, .3, .1, 2);
      for (let i = 0; i < HZ; i++) simulation.step();
      expect(simulation.positions.every(value => Number.isFinite(value) && Math.abs(value) < 5)).toBe(true);
    }
  });
});

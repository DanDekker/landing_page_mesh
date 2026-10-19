import { describe, expect, test } from 'bun:test';
import { Simulation } from '../src/physics/simulation.ts';
import { COUNT, ROWS, COLUMNS, FORMS, HZ, createEdges, normalizeSettings, writeShape } from '../src/shared/field.ts';

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

  test('closed forms share their seam vertices without a gap or long closing edge', () => {
    for (const form of ['silk', 'orbit'] as const) {
      const positions = new Float32Array(COUNT * 3), edges = createEdges(form);
      for (const time of [0, 4, 17, 60]) {
        writeShape(positions, form, time);
        for (let column = 0; column < COLUMNS; column++) {
          const a = (ROWS - 1) * COLUMNS + column, b = column;
          let joined = false;
          for (let e = 0; e < edges.length; e += 2) if (edges[e] === a && edges[e + 1] === b) joined = true;
          expect(joined).toBe(true);
          expect(Math.hypot(positions[a * 3]! - positions[b * 3]!, positions[a * 3 + 1]! - positions[b * 3 + 1]!, positions[a * 3 + 2]! - positions[b * 3 + 2]!)).toBeLessThan(.15);
        }
      }
      if (form === 'orbit') {
        for (let row = 0; row < ROWS; row++) {
          const a = row * COLUMNS + COLUMNS - 1, b = row * COLUMNS;
          let joined = false;
          for (let e = 0; e < edges.length; e += 2) if (edges[e] === a && edges[e + 1] === b) joined = true;
          expect(joined).toBe(true);
        }
      }
    }
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

  test('switching form while paused updates the sculpture and keeps it paused', () => {
    const simulation = new Simulation({ paused: true });
    simulation.configure({ form: 'orbit' });
    const expected = new Float32Array(COUNT * 3); writeShape(expected, 'orbit');
    expect(simulation.positions).toEqual(expected);
    expect(simulation.settings.paused).toBe(true);
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

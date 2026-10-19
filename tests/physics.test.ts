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
    for (const form of ['silk', 'orbit', 'knot'] as const) {
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

  test('pulling follows the picked surface and relaxes after release', () => {
    const simulation = new Simulation({ turbulence: 0 });
    const index = COLUMNS * 28 + 20, at = index * 3;
    const initial = { x: simulation.positions[at]!, y: simulation.positions[at + 1]!, z: simulation.positions[at + 2]! };
    simulation.pointer = { x: initial.x + .55, y: initial.y + .3, z: initial.z, index, active: true, down: true };
    for (let tick = 0; tick < HZ; tick++) simulation.step();
    const pulled = Math.hypot(simulation.positions[at]! - simulation.anchors[at]!, simulation.positions[at + 1]! - simulation.anchors[at + 1]!, simulation.positions[at + 2]! - simulation.anchors[at + 2]!);
    expect(pulled).toBeGreaterThan(.15);
    simulation.pointer = { x: 0, y: 0, z: 0, active: false, down: false };
    for (let tick = 0; tick < HZ * 2; tick++) simulation.step();
    const released = Math.hypot(simulation.positions[at]! - simulation.anchors[at]!, simulation.positions[at + 1]! - simulation.anchors[at + 1]!, simulation.positions[at + 2]! - simulation.anchors[at + 2]!);
    expect(released).toBeLessThan(pulled * .5);
  });

  test('wheel impulses apply angular momentum and remain bounded', () => {
    const simulation = new Simulation({ turbulence: 0 });
    simulation.swirl({ delta: .35, x: 0, y: 1, z: 0 });
    let momentum = 0;
    for (let i = 0; i < COUNT; i++) momentum += simulation.positions[i * 3 + 2]! * simulation.velocities[i * 3]! - simulation.positions[i * 3]! * simulation.velocities[i * 3 + 2]!;
    expect(momentum).toBeGreaterThan(1);
    for (let tick = 0; tick < HZ; tick++) simulation.step();
    expect(simulation.torsion).toBeGreaterThan(.3);
    expect(simulation.positions.every(value => Number.isFinite(value) && Math.abs(value) < 5)).toBe(true);
  });

  test('scrolling in opposite directions winds and unwinds the surface', () => {
    const simulation = new Simulation({ turbulence: 0 });
    simulation.swirl({ delta: .35, x: 0, y: 1, z: 0 });
    for (let tick = 0; tick < HZ; tick++) simulation.step();
    const wound = simulation.torsion;
    simulation.swirl({ delta: -.35, x: 0, y: 1, z: 0 });
    for (let tick = 0; tick < HZ; tick++) simulation.step();
    expect(simulation.torsion).toBeLessThan(wound * .5);
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

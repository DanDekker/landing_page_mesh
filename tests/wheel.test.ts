import { expect, test } from 'bun:test';
import { wheelDelta, WheelMotion } from '../src/shared/wheel.ts';

test('wheel and trackpad units give consistent small input and bounded large input', () => {
  expect(wheelDelta(3, 1, 900)).toBe(wheelDelta(48, 0, 900));
  expect(wheelDelta(.1, 2, 900)).toBe(wheelDelta(90, 0, 900));
  expect(wheelDelta(2, 0, 900)).toBeCloseTo(-.009, 8);
  expect(wheelDelta(10000, 0, 900)).toBe(-.55);
  expect(wheelDelta(-10000, 0, 900)).toBe(.55);
});

test('a direction change reverses the coil on the next step', () => {
  for (const delta of [.35, .01, .001]) {
    const motion = new WheelMotion(); motion.kick(.35);
    for (let i = 0; i < 8; i++) motion.step(1 / 77);
    motion.kick(-delta);
    const before = motion.amount; motion.step(1 / 77);
    expect(motion.amount).toBeLessThan(before);
  }
});

import { expect, test } from 'bun:test';
import { fit, project, unproject } from '../src/graphics/camera.ts';
import { COUNT, FORMS, writeShape } from '../src/shared/field.ts';

test('picking projects back to the same surface depth', () => {
  for (const aspect of [.46, 1, 1.6, 2.4]) {
    const view = { rotation: [.86, 1.2, -.31], scale: .48, aspect, center: [.12, -.07] };
    for (const point of [{ x: 1.2, y: .4, z: -.6 }, { x: -.7, y: -.3, z: .9 }]) {
      const screen = project(point, view), restored = unproject(screen.x, screen.y, screen.z, view);
      expect(restored.x).toBeCloseTo(point.x, 9); expect(restored.y).toBeCloseTo(point.y, 9); expect(restored.z).toBeCloseTo(point.z, 9);
    }
  }
});

test('the sculpture stays inside the frame on portrait and wide viewports', () => {
  const positions = new Float32Array(COUNT * 3);
  for (const aspect of [390 / 844, 1, 1440 / 900, 2.4]) {
    for (const form of FORMS) {
      for (const time of [0, 30, 70]) {
        writeShape(positions, form, time);
        const rotation = [.86 + Math.sin(time * .055) * .17, .12 + time * .045, -.31 + Math.sin(time * .04) * .13];
        const framing = fit(positions, rotation, aspect), view = { ...framing, rotation, aspect };
        let maxX = 0, maxY = 0;
        for (let i = 0; i < COUNT; i++) {
          const p = project({ x: positions[i * 3]!, y: positions[i * 3 + 1]!, z: positions[i * 3 + 2]! }, view);
          maxX = Math.max(maxX, Math.abs(p.x)); maxY = Math.max(maxY, Math.abs(p.y));
        }
        expect(maxX).toBeLessThan(.9); expect(maxY).toBeLessThan(.8);
      }
    }
  }
});

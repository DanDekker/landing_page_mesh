import type { Pointer } from '../shared/field.ts';
import { project, unproject, type Vec3, type View } from './camera.ts';

type Viewport = { left: number; top: number; width: number; height: number };

export class SurfaceGrab {
  private view: View;
  private depth: number;
  private offset: Vec3;

  constructor(point: Vec3, readonly index: number, clientX: number, clientY: number, view: View, private viewport: Viewport) {
    this.view = { ...view, rotation: [...view.rotation], center: [...view.center] };
    this.depth = project(point, this.view).z;
    const start = this.unproject(clientX, clientY);
    this.offset = { x: point.x - start.x, y: point.y - start.y, z: point.z - start.z };
  }

  private unproject(clientX: number, clientY: number) {
    const { left, top, width, height } = this.viewport;
    return unproject((clientX - left) / width * 2 - 1, 1 - (clientY - top) / height * 2, this.depth, this.view);
  }

  move(clientX: number, clientY: number): Pointer {
    const point = this.unproject(clientX, clientY);
    return { x: point.x + this.offset.x, y: point.y + this.offset.y, z: point.z + this.offset.z, index: this.index, active: true, down: true };
  }
}

import { describe, expect, it } from 'vitest';
import { Camera, screenToCell } from '../../src/render/camera';
import { TUNING } from '../../src/data/tuning';

describe('Camera', () => {
  it('maps the screen center to the camera cell', () => {
    const cam = new Camera();
    cam.snapTo(50.5, 30.5);
    const t = cam.transform(200, 100, 800, 600, 14);
    expect(screenToCell(t, 400, 300)).toEqual({ x: 50, y: 30 });
    expect(Number.isInteger(t.originX) && Number.isInteger(t.originY)).toBe(true);
  });

  it('clamps to level edges when the level is larger than the view', () => {
    const cam = new Camera();
    cam.snapTo(0, 0);
    const t = cam.transform(200, 100, 800, 600, 14);
    expect(t.originX).toBe(0);
    expect(t.originY).toBe(0);
  });

  it('centers a level smaller than the view', () => {
    const cam = new Camera();
    cam.snapTo(0, 0);
    const t = cam.transform(10, 10, 800, 600, 14);
    expect(t.originX).toBe(400 - 70);
    expect(t.originY).toBe(300 - 70);
  });

  it('zooms through discrete levels with integer device-pixel cells', () => {
    const cam = new Camera();
    expect(cam.zoom).toBe(1);
    cam.zoomBy(1);
    expect(cam.zoom).toBeGreaterThan(1);
    cam.zoomBy(-100);
    expect(cam.zoom).toBe(TUNING.zoomLevels[0]);
    for (const dpr of [1, 1.25, 1.5, 2, 3]) expect(Number.isInteger(cam.cellDevicePx(dpr))).toBe(true);
  });

  it('follows smoothly and converges', () => {
    const cam = new Camera();
    cam.follow(10, 0, 1 / 60);
    expect(cam.x).toBeGreaterThan(0);
    expect(cam.x).toBeLessThan(10);
    for (let i = 0; i < 300; i++) cam.follow(10, 0, 1 / 60);
    expect(cam.x).toBeCloseTo(10, 3);
  });
});

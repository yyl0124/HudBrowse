import { describe, expect, it } from 'vitest';
import { shellShape } from './shellShape';
import fixtures from '../../tests/fixtures/shell-shapes.json';

describe('shared native and painted shell geometry', () => {
  it.each(fixtures)('keeps the native $width × $height fixture current', fixture => {
    expect(shellShape(fixture.width, fixture.height, fixture.compact).points).toEqual(fixture.points);
  });
  it.each([[320, 568], [760, 560], [1120, 760], [1920, 1080]])('stays within the viewport at %i × %i', (width, height) => {
    const shape = shellShape(width, height, false);
    expect(shape.points.length).toBeLessThanOrEqual(512);
    expect(shape.points.every(point => point.x >= shape.margin - 0.001 && point.x <= width - shape.margin + 0.001 && point.y >= shape.top - 0.001 && point.y <= height - shape.margin + 0.001)).toBe(true);
    expect(shape.points.some(point => point.x === shape.left && point.y > shape.top + 28 && point.y < shape.bodyTop)).toBe(true);
  });
});

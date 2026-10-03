import { writeFileSync } from 'node:fs';
import { shellShape } from '../src/utils/shellShape.ts';

// Native integration tests consume exactly the points painted by the frontend.
const fixtures = [[1120, 760, false], [440, 100, true]].map(([width, height, compact]) => ({
  width, height, compact, points: shellShape(width, height, compact).points,
}));
writeFileSync(new URL('../tests/fixtures/shell-shapes.json', import.meta.url), JSON.stringify(fixtures));

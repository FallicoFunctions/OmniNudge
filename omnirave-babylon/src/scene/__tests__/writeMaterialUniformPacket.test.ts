import { expect, it } from 'vitest';
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { writeMaterialUniformPacket, type MaterialUniformEntry } from '../writeMaterialUniformPacket';

function fixture() {
  let id = 0;
  const engine = {
    supportsUniformBuffers: true, frameId: 1, _uniformBuffers: [],
    _features: { trackUbosInFrame: true, checkUbosContentBeforeUpload: true, uniformBufferHardCheckMatrix: true },
    createUniformBuffer: (data: Float32Array) => ({ uniqueId: ++id, values: data.slice() }),
    updateUniformBuffer: (buffer: { values: Float32Array }, data: Float32Array) => { buffer.values = data.slice(); },
    _releaseBuffer: () => true,
  };
  const make = () => {
    const buffer = new UniformBuffer(engine as unknown as AbstractEngine);
    buffer.addUniform('color', 4); buffer.addUniform('light', 4); buffer.addUniform('matrix', 16); buffer.addUniform('other', 3);
    buffer.create();
    return buffer;
  };
  const values = (buffer: UniformBuffer) => (buffer.getBuffer() as unknown as { values: Float32Array }).values;
  const packet = (color: number[], matrix: Matrix): MaterialUniformEntry[] => [
    { name: 'color', offset: 0, data: new Float32Array(color), matrix: false },
    { name: 'matrix', offset: 8, data: new Float32Array(matrix.asArray()), matrix: true },
  ];
  return { engine, make, values, packet };
}

it('matches native uniform writes through reordered draws and frame changes without changing live fields', () => {
  const f = fixture(), native = f.make(), cached = f.make();
  const colors = [[.1, .3, .5, 1], [.6, .2, .8, .9]];
  const matrices = [Matrix.Translation(1, 2, 3), Matrix.Translation(8, 5, 2)];
  const packets = colors.map((color, i) => f.packet(color, matrices[i]));
  const submitted: { buffer: { values: Float32Array }; values: Float32Array }[] = [];
  for (const order of [[0, 1, 0], [1, 0, 1], [1, 1, 0]]) {
    for (const index of order) {
      native.updateFloat4('color', ...colors[index] as [number, number, number, number]);
      native.updateMatrix('matrix', matrices[index]);
      writeMaterialUniformPacket(cached, packets[index]);
      for (const buffer of [native, cached]) {
        buffer.updateFloat4('light', f.engine.frameId * .17, 2, 3, 4);
        buffer.updateFloat3('other', 5, 6, 7); buffer.update();
      }
      expect(f.values(cached)).toEqual(f.values(native));
      submitted.push({ buffer: cached.getBuffer() as unknown as { values: Float32Array }, values: f.values(cached).slice() });
    }
    // Earlier draws in this frame must keep their own GPU backing values.
    for (const draw of submitted) expect(draw.buffer.values).toEqual(draw.values);
    submitted.length = 0;
    f.engine.frameId++;
  }
  native.dispose(); cached.dispose();
});

it('invalidates the matrix cache before a later native bind restores a previous matrix', () => {
  const f = fixture(), buffer = f.make();
  const first = Matrix.Translation(1, 2, 3), second = Matrix.Translation(8, 5, 2);
  buffer.updateMatrix('matrix', first); buffer.update();
  writeMaterialUniformPacket(buffer, f.packet([1, 1, 1, 1], second)); buffer.update();
  buffer.updateMatrix('matrix', first); buffer.update();
  expect(Array.from(f.values(buffer).slice(8, 24))).toEqual(Array.from(first.asArray()));
  buffer.dispose();
});

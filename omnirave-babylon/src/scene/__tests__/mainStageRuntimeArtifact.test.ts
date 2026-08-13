import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface RuntimeGlbJson {
  accessors: Array<{
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  bufferViews: Array<{ byteOffset?: number; byteStride?: number }>;
  meshes: Array<{ primitives: Array<{ attributes: { TANGENT?: number } }> }>;
}

function readGlb(filePath: string) {
  const buffer = readFileSync(filePath);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  const json = JSON.parse(buffer.toString('utf8', 20, jsonEnd).trim()) as RuntimeGlbJson;
  return { binaryOffset: jsonEnd + 8, buffer, json };
}

describe('production Main Stage GLB', { timeout: 30_000 }, () => {
  it('retains unit tangent space after Draco compression and decoding', () => {
    const projectRoot = process.cwd();
    const runtimeGlb = path.join(projectRoot, 'public/assets/venues/main-stage/main-stage.glb');
    const cli = path.join(projectRoot, 'node_modules/@gltf-transform/cli/bin/cli.js');
    const scratch = mkdtempSync(path.join(tmpdir(), 'omnirave-main-stage-runtime-'));
    const decodedGlb = path.join(scratch, 'decoded.glb');

    try {
      execFileSync(process.execPath, [cli, 'copy', runtimeGlb, decodedGlb], {
        encoding: 'utf8',
        stdio: 'pipe',
      });

      const { binaryOffset, buffer, json } = readGlb(decodedGlb);
      let tangentCount = 0;
      let minimumHandednessMagnitude = Number.POSITIVE_INFINITY;
      let maximumHandednessMagnitude = 0;
      let minimumLength = Number.POSITIVE_INFINITY;
      let maximumLength = 0;

      for (const mesh of json.meshes) {
        for (const primitive of mesh.primitives) {
          const tangentAccessorIndex = primitive.attributes.TANGENT;
          if (tangentAccessorIndex === undefined) continue;

          const accessor = json.accessors[tangentAccessorIndex];
          const view = json.bufferViews[accessor.bufferView];
          expect(accessor.componentType).toBe(5126);
          expect(accessor.type).toBe('VEC4');
          const stride = view.byteStride ?? 16;
          const start = binaryOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

          for (let index = 0; index < accessor.count; index += 1) {
            const offset = start + index * stride;
            const x = buffer.readFloatLE(offset);
            const y = buffer.readFloatLE(offset + 4);
            const z = buffer.readFloatLE(offset + 8);
            const handednessMagnitude = Math.abs(buffer.readFloatLE(offset + 12));
            const length = Math.hypot(x, y, z);
            minimumHandednessMagnitude = Math.min(minimumHandednessMagnitude, handednessMagnitude);
            maximumHandednessMagnitude = Math.max(maximumHandednessMagnitude, handednessMagnitude);
            minimumLength = Math.min(minimumLength, length);
            maximumLength = Math.max(maximumLength, length);
            tangentCount += 1;
          }
        }
      }

      expect(tangentCount).toBeGreaterThan(400_000);
      expect(minimumLength).toBeGreaterThan(0.999);
      expect(maximumLength).toBeLessThan(1.001);
      expect(minimumHandednessMagnitude).toBeGreaterThan(0.999);
      expect(maximumHandednessMagnitude).toBeLessThan(1.001);
    } finally {
      rmSync(scratch, { force: true, recursive: true });
    }
  });
});

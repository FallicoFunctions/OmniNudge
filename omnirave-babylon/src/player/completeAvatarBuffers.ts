import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { Buffer, VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import type { Geometry } from '@babylonjs/core/Meshes/geometry.js';

const packedGeometry = new WeakSet<Geometry>();
const skinKinds = ['position', 'normal', 'matricesIndices', 'matricesWeights'] as const;

export function prepareCompleteAvatarVertexBuffers(scene: Scene, meshes: readonly AbstractMesh[]) {
  // Expand packed glTF attributes on WebGPU: the tested adapter reads the
  // mixed/interleaved layout incorrectly for these skinned primitives.
  // Validate in separate float streams first. The pool can then combine the
  // four common skin streams in a consistent layout, after mesh batching.
  if (scene.getEngine().isWebGPU) {
    for (const mesh of meshes) if (mesh instanceof Mesh && mesh.skeleton) {
      if (mesh.geometry && packedGeometry.has(mesh.geometry)) continue;
      for (const kind of mesh.getVerticesDataKinds()) {
        const buffer = mesh.getVertexBuffer(kind);
        // Pooled copies share the source geometry. Once a buffer is a separate
        // float stream, retain it instead of replacing it for every new rig.
        if (buffer?.type === VertexBuffer.FLOAT && !buffer.normalized
          && buffer.byteOffset === 0 && buffer.byteStride === buffer.getSize() * Float32Array.BYTES_PER_ELEMENT) continue;
        const data = mesh.getVerticesData(kind);
        // RGB colors have three components; the default color stride is four.
        // Keep the original width when expanding packed attributes.
        if (data) mesh.setVerticesData(kind, new Float32Array(data), false, buffer?.getSize());
      }
    }
  }
}

/** Optional for normal meshes; required for instance attributes on eight-buffer GPUs. */
export function interleaveCompleteAvatarVertexBuffers(scene: Scene, meshes: readonly AbstractMesh[], requiredForInstances = false) {
  if (!scene.getEngine().isWebGPU || (!requiredForInstances && scene.metadata?.avatarVertexBufferExperiment !== true)) return;
  for (const mesh of meshes) {
    if (!(mesh instanceof Mesh) || !mesh.skeleton || !mesh.computeBonesUsingShaders
      || !mesh.geometry || packedGeometry.has(mesh.geometry)) continue;
    const count = mesh.getTotalVertices();
    if (skinKinds.some(kind => !mesh.getVertexBuffer(kind))) continue;
    // Fixed offsets matter: Babylon's pipeline cache keys include the stream
    // format/stride, but not its offset. Never depend on glTF attribute order
    // or let optional UV/color/tangent streams change the core layout.
    const attributes = skinKinds.map(kind => {
      const buffer = mesh.getVertexBuffer(kind)!;
      return { kind, buffer, size: buffer.getSize(), data: buffer.getFloatData(count) };
    });
    if (!count || attributes.some(({ buffer, size, data }, index) =>
      buffer.type !== VertexBuffer.FLOAT || buffer.normalized || buffer.isUpdatable() || buffer.getIsInstanced()
      || size !== (index < 2 ? 3 : 4) || !data || data.length !== count * size)) continue;
    const stride = attributes.reduce((sum, attribute) => sum + attribute.size, 0);
    const packed = new Float32Array(count * stride);
    let offset = 0;
    for (const attribute of attributes) {
      for (let vertex = 0; vertex < count; vertex++) for (let component = 0; component < attribute.size; component++) {
        packed[vertex * stride + offset + component] = attribute.data![vertex * attribute.size + component];
      }
      offset += attribute.size;
    }
    const shared = new Buffer(scene.getEngine(), packed, false, stride);
    offset = 0;
    for (const attribute of attributes) {
      const buffer = new VertexBuffer(scene.getEngine(), shared, attribute.kind, {
        stride, offset, size: attribute.size, type: VertexBuffer.FLOAT, takeBufferOwnership: true,
      });
      mesh.setVerticesBuffer(buffer, true, count);
      offset += attribute.size;
    }
    packedGeometry.add(mesh.geometry);
  }
}

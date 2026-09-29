import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';

export interface MaterialUniformEntry {
  name: string;
  offset: number;
  data: Float32Array;
  matrix: boolean;
}

interface TrackedUniformBuffer {
  useUbo: boolean;
  _dynamic: boolean;
  _trackUBOsInFrame: boolean;
  _createBufferOnWrite: boolean;
  _needSync: boolean;
  _valueCache: Record<string, unknown>;
  _checkNewFrame(): void;
  _createNewBuffer(): void;
  getData(): Float32Array;
  updateUniform(name: string, data: Float32Array, size: number): void;
}

/** Restore float32 material values using Babylon's tracked-buffer write protocol. */
export function writeMaterialUniformPacket(buffer: UniformBuffer, entries: readonly MaterialUniformEntry[]): void {
  const native = buffer as unknown as TrackedUniformBuffer;
  if (!native.useUbo || native._dynamic || !native._trackUBOsInFrame
    || typeof native._checkNewFrame !== 'function' || typeof native._createNewBuffer !== 'function') {
    for (const entry of entries) {
      if (entry.matrix) delete native._valueCache[entry.name];
      native.updateUniform(entry.name, entry.data, entry.data.length);
    }
    return;
  }
  // All entries came from this buffer's own Float32Array. They need neither
  // conversion nor another uniform-name lookup. Rotate the backing GPU buffer
  // before the first changed write, exactly as UniformBuffer.updateUniform does.
  native._checkNewFrame();
  const data = native.getData();
  for (const entry of entries) {
    let changed = false;
    for (let index = 0; index < entry.data.length; index++) {
      if (data[entry.offset + index] !== entry.data[index]) { changed = true; break; }
    }
    if (!changed) continue;
    if (native._createBufferOnWrite) native._createNewBuffer();
    data.set(entry.data, entry.offset);
    native._needSync = true;
    if (entry.matrix) delete native._valueCache[entry.name];
  }
}

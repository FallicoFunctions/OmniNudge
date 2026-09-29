import type { Scene } from '@babylonjs/core/scene.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';

export function createStudioEnvironment(scene: Scene) {
  // Original neutral studio reflection map: broad softboxes make metallic cloth,
  // lenses and jewelry readable without baking highlights into their colors.
  const directions = [
    (u: number, v: number) => [1, -v, -u], (u: number, v: number) => [-1, -v, u],
    (u: number, v: number) => [u, 1, v], (u: number, v: number) => [u, -1, -v],
    (u: number, v: number) => [u, -v, 1], (u: number, v: number) => [-u, -v, -1],
  ];
  const cubeSize = 64;
  const faces = directions.map(toDir => {
    const pixels = new Uint8Array(cubeSize * cubeSize * 4);
    for (let y = 0;y < cubeSize;y++)for (let x = 0;x < cubeSize;x++) {
      const d = toDir(2 * (x + .5) / cubeSize - 1, 2 * (y + .5) / cubeSize - 1);
      const len = Math.hypot(...d); const [nx, ny, nz] = d.map(v => v / len);
      const softbox = Math.pow(Math.max(0, nx * .65 + ny * .35 + nz * .68), 18);
      const strip = Math.pow(Math.max(0, -nx * .85 + ny * .25 + nz * .46), 35);
      const value = .045 + .16 * Math.max(0, ny) + .7 * softbox + .5 * strip;
      const i = (y * cubeSize + x) * 4;
      pixels[i] = Math.min(255, value * 255); pixels[i + 1] = Math.min(255, value * 250); pixels[i + 2] = Math.min(255, value * 242); pixels[i + 3] = 255;
    }
    return pixels;
  });
  const texture = new RawCubeTexture(scene, faces, cubeSize, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.gammaSpace = false;
  return texture;
}

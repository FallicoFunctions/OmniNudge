import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, resample, sparse, textureCompress, unpartition, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { ready as resampleReady, resample as resampleWASM } from 'keyframe-resample';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// The repository only uses these four glTF operations. Use the supported
// transform API directly, avoiding the CLI's unpatched micromatch/braces chain.
// Avatar profiles preserve the flags previously passed to `gltf-transform optimize`.
export async function transformAsset(profile, input, output) {
  if (!['decode', 'draco', 'modular-avatar', 'complete-avatar'].includes(profile)) {
    throw new Error(`Unknown asset transform: ${profile}`);
  }
  if (!input || !output || path.extname(output).toLowerCase() !== '.glb') {
    throw new Error('Expected input and output .glb paths');
  }
  const [decoder, encoder] = await Promise.all([
    draco3d.createDecoderModule(), draco3d.createEncoderModule(),
    MeshoptDecoder.ready, MeshoptEncoder.ready,
  ]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': decoder, 'draco3d.encoder': encoder,
    'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
  });
  const document = await io.read(input);
  // Match the CLI's decode-on-read behavior, so a copy never recompresses
  // already lossy geometry and avatar profiles keep compression disabled.
  for (const name of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression']) {
    if (document.hasExtension(name)) document.disposeExtension(name);
  }
  if (profile === 'draco') {
    await document.transform(draco({ method: 'edgebreaker', encodeSpeed: 4, decodeSpeed: 6 }));
  } else if (profile !== 'decode') {
    const complete = profile === 'complete-avatar';
    const transforms = [dedup()];
    if (complete) transforms.push(weld());
    transforms.push(resample({ ready: resampleReady, resample: resampleWASM }));
    if (complete) transforms.push(prune({
      keepAttributes: false, keepIndices: false, keepLeaves: false, keepSolidTextures: false,
    }));
    const size = complete ? 2048 : 1024;
    transforms.push(sparse(), textureCompress({
      encoder: sharp, resize: [size, size], targetFormat: 'webp', limitInputPixels: true,
    }));
    await document.transform(...transforms);
  }
  await document.transform(unpartition());
  await io.write(output, document);
  console.log(`${profile}: ${io.lastReadBytes} -> ${io.lastWriteBytes} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [profile, input, output, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Unexpected asset transform arguments');
  await transformAsset(profile, input, output);
}

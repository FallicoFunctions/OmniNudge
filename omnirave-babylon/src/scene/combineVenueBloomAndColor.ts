import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { imageProcessingPixelShaderWGSL } from '@babylonjs/core/ShadersWGSL/imageProcessing.fragment.js';
import type { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
import type { EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import type { Scene } from '@babylonjs/core/scene.js';

const sample = 'var result: vec4f=textureSample(textureSampler,textureSamplerSampler,input.vUV);';
const fusedSample = `var result = textureSample(venueSceneColor, venueSceneColorSampler, input.vUV);
let blurred = textureSample(textureSampler, textureSamplerSampler, input.vUV).rgb;
result = vec4f(result.rgb + blurred * uniforms.venueBloomWeight, result.a);
#ifdef VENUE_BLOOM_HALF
result = quantizeToF16(result);
#endif
#ifdef VENUE_BLOOM_BYTE
result = round(clamp(result, vec4f(0), vec4f(1)) * 255.0) / 255.0;
#endif
`;

/** Preserve the native bloom merge, storage rounding, and image-processing equations. */
export function combineVenueBloomAndColor(scene: Scene, pipeline: DefaultRenderingPipeline, textureType: number): void {
  if (!scene.getEngine().isWebGPU || !imageProcessingPixelShaderWGSL.shader.includes(sample)) return;
  ShaderStore.ShadersStoreWGSL.venueBloomImageProcessingPixelShader = imageProcessingPixelShaderWGSL.shader
    .replace('#include<imageProcessingDeclaration>', `var venueSceneColorSampler: sampler;
var venueSceneColor: texture_2d<f32>;
uniform venueBloomWeight: f32;
#include<imageProcessingDeclaration>`).replace(sample, fusedSample);
  const rounding = textureType === Constants.TEXTURETYPE_HALF_FLOAT ? '#define VENUE_BLOOM_HALF'
    : textureType === Constants.TEXTURETYPE_UNSIGNED_BYTE ? '#define VENUE_BLOOM_BYTE' : '';
  const installed = new WeakSet<PostProcess>(), restores: (() => void)[] = [];
  const install = () => {
    if (!pipeline.bloomEnabled || !pipeline.imageProcessingEnabled || !pipeline.imageProcessing) return;
    const post = pipeline.imageProcessing;
    const bloom = (pipeline as unknown as { bloom: { _merge: PostProcess; _downscale: PostProcess } }).bloom;
    if (installed.has(post)) return;
    installed.add(post);
    const internal = post as unknown as { _options: number; _effectWrapper: EffectWrapper };
    const originalSize = internal._options, wrapper = internal._effectWrapper, update = wrapper.updateEffect;
    wrapper.updateEffect = function(defines, uniforms, samplers, indices, compiled, error, vertex) {
      update.call(this, `${defines ?? ''}\n${rounding}`, [...new Set([...(uniforms ?? []), 'venueBloomWeight'])],
        [...new Set([...(samplers ?? []), 'venueSceneColor'])], indices, compiled, error, vertex, 'venueBloomImageProcessing');
    };
    // Keep vertical blur's output at its original resolution. The fused pass
    // still writes to the following full-resolution sharpening target.
    internal._options = (bloom._merge as unknown as { _options: number })._options;
    post.useOwnOutput(); post.markTextureDirty();
    const bind = post.onApplyObservable.add(effect => {
      effect.setTextureFromPostProcess('venueSceneColor', bloom._downscale);
      effect.setFloat('venueBloomWeight', pipeline.bloomWeight);
      const engine = scene.getEngine();
      post.imageProcessingConfiguration.bind(effect, engine.getRenderWidth(true) / engine.getRenderHeight(true));
    });
    post.name = 'bloom + imageProcessing';
    post._updateParameters();
    for (const camera of scene.cameras) camera.detachPostProcess(bloom._merge);
    restores.push(() => { wrapper.updateEffect = update; internal._options = originalSize; post.onApplyObservable.remove(bind); });
    scene.metadata = { ...scene.metadata, venueCombinedBloomColor: true };
  };
  install();
  const rebuilt = pipeline.onBuildObservable.add(install);
  scene.onDisposeObservable.addOnce(() => { pipeline.onBuildObservable.remove(rebuilt); restores.forEach(restore => restore()); });
}

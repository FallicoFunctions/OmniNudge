import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import type { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/core/ShadersWGSL/postprocess.vertex.js';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/helperFunctions.js';

// Same equations as Babylon 8.56.2's Apache-2.0 sharpen and grain shaders.
// Keep the intermediate storage rounding, while avoiding its full-screen target.
export const venueFinishingShader = `
#include<helperFunctions>
varying vUV: vec2f;
var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
uniform screenSize: vec2f;
uniform sharpnessAmounts: vec2f;
uniform grainIntensity: f32;
uniform grainSeed: f32;
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
  let pixel = vec2f(1.0) / uniforms.screenSize;
  let color = textureSample(textureSampler, textureSamplerSampler, input.vUV);
  let edge = textureSample(textureSampler, textureSamplerSampler, input.vUV + pixel * vec2f(0,-1))
    + textureSample(textureSampler, textureSamplerSampler, input.vUV + pixel * vec2f(-1,0))
    + textureSample(textureSampler, textureSamplerSampler, input.vUV + pixel * vec2f(1,0))
    + textureSample(textureSampler, textureSamplerSampler, input.vUV + pixel * vec2f(0,1)) - color * 4.0;
  var sharpened = max(vec4f(color.rgb * uniforms.sharpnessAmounts.y, color.a)
    - uniforms.sharpnessAmounts.x * vec4f(edge.rgb, 0), vec4f(0));
#ifdef VENUE_INTERMEDIATE_HALF
  sharpened = quantizeToF16(sharpened);
#endif
#ifdef VENUE_INTERMEDIATE_BYTE
  sharpened = round(clamp(sharpened, vec4f(0), vec4f(1)) * 255.0) / 255.0;
#endif
  let grain = dither(input.vUV * uniforms.grainSeed, uniforms.grainIntensity);
  let luminance = getLuminance(sharpened.rgb);
  let amount = (cos(-PI + luminance * PI * 2.0) + 1.0) / 2.0;
  fragmentOutputs.color = vec4f(max(sharpened.rgb + grain * amount, vec3f(0)), sharpened.a);
}`;

export function combineVenueFinishingPasses(scene: Scene, pipeline: DefaultRenderingPipeline, textureType: number): void {
  if (!scene.getEngine().isWebGPU || !pipeline.grainEnabled || !pipeline.sharpenEnabled) return;
  ShaderStore.ShadersStoreWGSL.venueFinishingPixelShader = venueFinishingShader;
  const sharpen = pipeline.sharpen, grain = pipeline.grain;
  const originalUpdate = sharpen.updateEffect;
  const rounding = textureType === Constants.TEXTURETYPE_HALF_FLOAT ? '#define VENUE_INTERMEDIATE_HALF'
    : textureType === Constants.TEXTURETYPE_UNSIGNED_BYTE ? '#define VENUE_INTERMEDIATE_BYTE' : '';
  sharpen.updateEffect = function(defines, uniforms, samplers, indices, compiled, error, vertex) {
    originalUpdate.call(this, `${defines ?? ''}\n${rounding}`,
      [...new Set([...(uniforms ?? []), 'screenSize', 'sharpnessAmounts', 'grainIntensity', 'grainSeed'])],
      samplers, indices, compiled, error, vertex, 'venueFinishing');
  };
  const bind = sharpen.onApplyObservable.add(effect => {
    effect.setFloat('grainIntensity', grain.intensity);
    effect.setFloat('grainSeed', grain.animated ? Math.random() + 1 : 1);
  });
  sharpen.name = 'sharpen + grain';
  pipeline.grainEnabled = false;
  sharpen.updateEffect();
  scene.metadata = { ...scene.metadata, venueCombinedFinishing: true };
  scene.onDisposeObservable.addOnce(() => { sharpen.updateEffect = originalUpdate; sharpen.onApplyObservable.remove(bind); });
}

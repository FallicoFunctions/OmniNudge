// Static registration of the WGSL shader library for the WebGPU engine.
//
// These MUST be static imports discovered at server start: dynamic imports
// of ShadersWGSL modules are found by Vite mid-session, trigger a dep-graph
// re-optimization under a live page, and serve stale chunks that break the
// default WebGL path (post-mortem: commit 8df2c4817). Static imports cost
// bundle size but keep one consistent module graph.
//
// Not imported here: volumetricLightScattering has no WGSL variant; the
// presentation rig already guards its creation with try/catch and the
// WebGPU path simply runs without the scattering haze.
import '@babylonjs/core/ShadersWGSL/pbr.vertex.js';
import '@babylonjs/core/ShadersWGSL/pbr.fragment.js';
import '@babylonjs/core/ShadersWGSL/default.vertex.js';
import '@babylonjs/core/ShadersWGSL/default.fragment.js';
import '@babylonjs/core/ShadersWGSL/shadowMap.vertex.js';
import '@babylonjs/core/ShadersWGSL/shadowMap.fragment.js';
import '@babylonjs/core/ShadersWGSL/depth.vertex.js';
import '@babylonjs/core/ShadersWGSL/depth.fragment.js';
import '@babylonjs/core/ShadersWGSL/postprocess.vertex.js';
import '@babylonjs/core/ShadersWGSL/imageProcessing.fragment.js';
import '@babylonjs/core/ShadersWGSL/extractHighlights.fragment.js';
import '@babylonjs/core/ShadersWGSL/kernelBlur.vertex.js';
import '@babylonjs/core/ShadersWGSL/kernelBlur.fragment.js';
import '@babylonjs/core/ShadersWGSL/bloomMerge.fragment.js';
import '@babylonjs/core/ShadersWGSL/sharpen.fragment.js';
import '@babylonjs/core/ShadersWGSL/grain.fragment.js';
import '@babylonjs/core/ShadersWGSL/fxaa.vertex.js';
import '@babylonjs/core/ShadersWGSL/fxaa.fragment.js';
import '@babylonjs/core/ShadersWGSL/rgbdDecode.fragment.js';
import '@babylonjs/core/ShadersWGSL/glowMapGeneration.vertex.js';
import '@babylonjs/core/ShadersWGSL/glowMapGeneration.fragment.js';
import '@babylonjs/core/ShadersWGSL/background.vertex.js';
import '@babylonjs/core/ShadersWGSL/background.fragment.js';
// Cascade court living water: particle sprays plus runtime-generated ripple
// normal maps. DynamicTexture needs its engine extension registered on the
// tree-shaken WebGPU engine (without it, construction throws
// "engine.createDynamicTexture is not a function").
import '@babylonjs/core/ShadersWGSL/particles.vertex.js';
import '@babylonjs/core/ShadersWGSL/particles.fragment.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture.js';

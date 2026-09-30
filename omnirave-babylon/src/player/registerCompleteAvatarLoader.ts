// The launch pair uses glTF 2.0 and only these extensions (all three detail
// levels). The glTF barrel also loads legacy glTF, FlowGraph, audio and other
// unused loaders into the game's first navigation.
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
// Wardrobe slots, batching groups and authored material settings live in
// glTF extras; this loader hook is required even without extensionsUsed.
import '@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_clearcoat.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_iridescence.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_sheen.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_transmission.js';

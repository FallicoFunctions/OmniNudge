import { Animation, AnimationGroup, Bone, Matrix, MeshBuilder, NullEngine, PBRMaterial, Scene, Skeleton, TransformNode, VertexBuffer } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createCompleteAvatar } from '../createCompleteAvatar';
import { createCompleteWardrobePreferences } from '../completeWardrobePreferences';

let engine: NullEngine | undefined;
afterEach(() => { vi.restoreAllMocks(); engine?.dispose(); localStorage.removeItem('omnirave.complete-wardrobe.v1.female'); });

it.each([[false, true], [true, true], [false, false], [true, false]])(
  'preserves garment categories, vertex values and clips with WebGPU=%s and local preferences=%s', async (webgpu, persistWardrobe) => {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const garment = new TransformNode('jacket', scene);
  garment.metadata = { gltf: { extras: { avatarSlot: 'jacket', avatarOptionId: 'foil' } } };
  const panels = ['shell', 'trim'].map(name => {
    const mesh = MeshBuilder.CreateBox(name, {}, scene);
    mesh.parent = garment;
    return mesh;
  });
  const foil = new PBRMaterial('authored foil', scene);
  foil.subSurface.isRefractionEnabled = true;
  foil.metadata = { gltf: { extras: { launchIridescent: true, launchFilmTexture: 'film.png' } } };
  foil.iridescence.minimumThickness = 180; foil.iridescence.maximumThickness = 620;
  foil.iridescence.indexOfRefraction = 1.65; foil.iridescence.intensity = .9;
  panels[0].material = foil;
  const top = MeshBuilder.CreateBox('top', {}, scene);
  top.metadata = { gltf: { extras: { avatarSlot: 'top' } } };
  const hair = MeshBuilder.CreateBox('hair', {}, scene);
  hair.metadata = { gltf: { extras: { avatarSlot: 'hair' } } };
  const fibers = new PBRMaterial('PLURR hair strands', scene);
  fibers.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  fibers.alphaCutOff = .32;
  hair.material = fibers;
  const skeleton = new Skeleton('avatar', 'avatar', scene);
  for (let i = 0; i < 56; i++) new Bone(`bone-${i}`, skeleton, null, Matrix.Identity());
  const groups = ['idle', 'walk', 'run'].map(name => {
    const group = new AnimationGroup(name, scene);
    const track = new Animation(name, 'position.x', 30, Animation.ANIMATIONTYPE_FLOAT);
    track.setKeys([{ frame: 0, value: 0 }, { frame: 30, value: 1 }]);
    group.addTargetedAnimation(track, garment);
    return group;
  });
  vi.spyOn(SceneLoader, 'ImportMeshAsync').mockResolvedValue({
    meshes: [...panels, top, hair], transformNodes: [garment], skeletons: [skeleton],
    animationGroups: groups, particleSystems: [], geometries: [], lights: [], spriteManagers: [],
  });
  panels[0].skeleton = skeleton;
  const packedJoints = new Uint8Array(panels[0].getTotalVertices() * 4);
  for (let i = 0; i < packedJoints.length; i += 4) packedJoints[i] = 5;
  panels[0].setVerticesBuffer(new VertexBuffer(engine, packedJoints, VertexBuffer.MatricesIndicesKind, false, false, 4, false, 0, 4, VertexBuffer.UNSIGNED_BYTE, false));
  const positions = Array.from(panels[0].getVerticesData('position')!);
  Object.defineProperty(engine, 'isWebGPU', { get: () => webgpu });
  createCompleteWardrobePreferences('female').save(['jacket']);
  const avatar = await createCompleteAvatar(scene, 'female', { persistWardrobe });
  expect(avatar.wardrobe!.saveState).toBe(persistWardrobe ? 'saved' : 'session');
  expect(panels.every(panel => panel.isEnabled() === !persistWardrobe)).toBe(true);
  avatar.wardrobe!.reset();
  expect(Array.from(panels[0].getVerticesData('position')!)).toEqual(positions);
  expect(Array.from(panels[0].getVerticesData(VertexBuffer.MatricesIndicesKind)!)).toEqual(Array.from(packedJoints));
  expect(panels[0].getVertexBuffer(VertexBuffer.MatricesIndicesKind)!.type).toBe(webgpu ? VertexBuffer.FLOAT : VertexBuffer.UNSIGNED_BYTE);
  for (const panel of panels) {
    expect(panel.metadata.avatarSlot).toBe('jacket');
    expect(panel.metadata.avatarOptionId).toBe('foil');
  }
  expect(foil.iridescence.isEnabled).toBe(true);
  expect(foil.iridescence.minimumThickness).toBe(180);
  expect(foil.iridescence.maximumThickness).toBe(620);
  expect(foil.iridescence.indexOfRefraction).toBe(1.65);
  expect(foil.iridescence.intensity).toBe(.9);
  expect(foil.allowShaderHotSwapping).toBe(!webgpu);
  expect(top.metadata.avatarSlot).toBe('top');
  expect(fibers.alphaCutOff).toBe(.32);
  expect(fibers.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHATEST);
  avatar.wardrobe!.setVisible('jacket', false);
  expect(panels.every(panel => !panel.isEnabled())).toBe(true);
  expect(top.isEnabled()).toBe(true);
  avatar.wardrobe!.reset();
  expect(panels.every(panel => panel.isEnabled())).toBe(true);
  expect(createCompleteWardrobePreferences('female').read()).toEqual(persistWardrobe ? [] : ['jacket']);
  avatar.animate(0, 'run');
  expect(groups[0].isPlaying).toBe(false);
  expect(groups[2].isPlaying).toBe(true);
  avatar.dispose?.();
  avatar.root.dispose(false, true);
  expect(scene.animationGroups).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
});

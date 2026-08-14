import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readProjectFile = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Main Stage authoring scripts', () => {
  it('encodes generated OpenGL normal maps with both height gradients negated', () => {
    const source = readProjectFile('scripts/generate-main-stage-subtle-textures.py');
    expect(source).toContain('-gx / norm * 0.5 + 0.5');
    expect(source).toContain('-gy / norm * 0.5 + 0.5');
  });

  it('reverses reflected cascade face winding and removes owned orphan mesh data', () => {
    for (const script of [
      'scripts/generate-cascade-court.py',
      'scripts/generate-cascade-court-water.py',
      'scripts/generate-cascade-court-gardens.py',
    ]) {
      const source = readProjectFile(script);
      expect(source).toContain('bmesh.ops.reverse_faces');
      expect(source).toContain('if mesh.users == 0:');
      expect(source).toContain('bpy.data.meshes.remove(mesh)');
    }

    for (const script of [
      'scripts/generate-approach-deck.py',
      'scripts/generate-main-stage-arcades.py',
    ]) {
      const source = readProjectFile(script);
      expect(source).toContain('if mesh.users == 0:');
      expect(source).toContain('bpy.data.meshes.remove(mesh)');
    }
  });

  it('makes additive light and panel-gap passes idempotent', () => {
    const approach = readProjectFile('scripts/generate-main-stage-approach-lights.py');
    const lanterns = readProjectFile('scripts/extend-wing-lanterns.py');
    const panelGaps = readProjectFile('scripts/seal-main-stage-panel-gaps.py');

    expect(approach).toContain('SOURCE_Y = 104.0');
    expect(approach).toContain('POSITION_TOLERANCE');
    expect(approach).toContain('copiesAdded=');
    expect(lanterns).toContain('existing_centers');
    expect(lanterns).toContain('POSITION_TOLERANCE');
    expect(panelGaps).toContain('SEAL_MARKER');
    expect(panelGaps).toContain('mesh.get(SEAL_MARKER)');
    expect(panelGaps).toContain('obj.get(SEAL_MARKER)');
  });
});

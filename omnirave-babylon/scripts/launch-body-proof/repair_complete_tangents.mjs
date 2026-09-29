/** Repair only degenerate tangent directions after baking or mesh reduction. */
export function repairDegenerateTangents(document, label) {
  let tangentFallbackVertices = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const tangent = primitive.getAttribute('TANGENT');
    const normal = primitive.getAttribute('NORMAL');
    if (!tangent || !normal) continue;
    const values = tangent.getArray();
    const normals = normal.getArray();
    for (let i = 0; i < tangent.getCount(); i++) {
      const length = Math.hypot(values[4*i], values[4*i+1], values[4*i+2]);
      if (Number.isFinite(length) && length > 1e-8) continue;
      // A collapsed UV derivative has no tangent direction. Use a stable
      // orthogonal basis at that vertex instead of exporting a zero vector.
      const [nx, ny, nz] = normals.slice(3*i, 3*i+3);
      const direction = Math.abs(nz) < .9 ? [-ny, nx, 0] : [0, -nz, ny];
      const magnitude = Math.hypot(...direction);
      if (!(magnitude > 1e-8)) throw new Error(`${label}: invalid normal at tangent fallback`);
      for (let axis = 0; axis < 3; axis++) values[4*i+axis] = direction[axis] / magnitude;
      values[4*i+3] = values[4*i+3] < 0 ? -1 : 1;
      tangentFallbackVertices++;
    }
  }
  return tangentFallbackVertices;
}

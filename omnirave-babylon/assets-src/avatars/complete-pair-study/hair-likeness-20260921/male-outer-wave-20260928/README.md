# Male outer wave pass

The outer left sweep now separates from the dense frontal groom as a loose wave. The first three pairs of all 831 edited hair ribbons remain fixed to the scalp. The rest bend outward and forward; the center hairline, side layers, skinning, UVs, outfit, and animation are retained.

## Review

- [Front](candidate-front.png), [three-quarter](candidate-three-quarter.png), and [side](candidate-side.png) are fixed-camera Blender renders.
- [Browser preview](browser-preview.png) shows the delivered asset in the local Babylon.js review page.
- The change is incremental. The dense frontal fringe and compact top remain the main differences from the reference artwork. Broad displacement and aggressive shortening candidates were rejected because they produced negligible silhouette improvement or patchy texture.

## Validation

- Native validation: 27 idle, walk, and run samples; 1.466 mm maximum scalp-root distance across tested expressions and hair poses; 39 non-hair meshes preserved.
- All three portable LODs: glTF validation 0 errors; only the swept groom's position, normal, tangent, and morph geometry changed. Rig, outfits, materials, textures, and animations matched the saved pre-change assets. Gzip round trips passed.
- Browser preview loaded without console errors.

The finite pose tests do not prove continuous strand self-contact or all possible collision states.

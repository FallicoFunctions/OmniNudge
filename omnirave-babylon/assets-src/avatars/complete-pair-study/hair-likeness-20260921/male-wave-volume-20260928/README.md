# Male crown wave volume pass

The retained male groom now has a fuller swept crown. A narrow lane of 873 existing ribbons was lifted and pulled slightly forward and left. Three root pairs per ribbon remain fixed; UVs, materials, skinning, morphs, outfit, and animation are retained.

## Review

- [Front](candidate-front.png), [three-quarter](candidate-three-quarter.png), [side](candidate-side.png), and [back](candidate-back.png) are fixed-camera Blender renders.
- [Browser preview](browser-preview.png) shows the delivered asset in the Babylon.js review page.
- The crown has more height and directional sweep. The dense, straight frontal fringe and side haircut still differ substantially from the loose reference hair. Tests that split the existing fringe into a few locks created patchy or stiff shapes and were rejected.

## Validation

- Native validation: 27 idle, walk, and run samples; 1.466 mm maximum scalp-root distance across tested expressions and hair poses; 39 non-hair meshes preserved.
- All three portable LODs: glTF validation 0 errors; only the swept groom's position, normal, tangent, and morph geometry changed. Rig, outfits, materials, textures, and animations matched the saved pre-change assets. Gzip round trips passed.
- Browser preview loaded without console errors.

The finite pose tests do not prove continuous strand self-contact or all possible collision states.

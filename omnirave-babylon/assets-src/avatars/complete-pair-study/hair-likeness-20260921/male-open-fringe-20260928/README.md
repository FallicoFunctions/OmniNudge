# Male groom: lower rear coverage and open fringe

The previous male groom had a hard, high fade behind the ear and a dense,
squared-off fringe across the forehead. Two rig-preserving sculpt passes now
run after the existing reference-based groom:

- `refine_male_lower_rear_hair.py` lowers the cap, rooted underlayer, swept
  groom, and side strands by up to 19.2 mm along the head at the rear. It
  keeps the ear opening and front hairline clear.
- `refine_male_open_fringe.py` shortens and tapers the free ends of 2,232
  frontal groom ribbons while leaving all roots in their original positions.

The accepted native source is `../male-hair-refined.blend`; all three male
portable levels and their gzip copies are updated. The female asset is outside
this pass. The retained rig, outfits, materials, textures, and animation data
compare exactly with the immediately preceding male GLBs apart from the
intended hair positions and normals. The glTF validator found zero errors.

Validation sampled 27 idle/walk/run frames and seven neutral/expression poses.
The maximum groom-root distance from the scalp was 1.47 mm. This is a finite
sample, not a guarantee against every possible hair intersection.

The front and three-quarter renders in this folder show a more open hairline;
the preceding rear candidate renders are in `../male-lower-rear-20260928/`.
The hairstyle still needs a more convincing wavy lock silhouette and closer
reference color breakup. This pass improves the existing groom without
claiming that its likeness is finished.

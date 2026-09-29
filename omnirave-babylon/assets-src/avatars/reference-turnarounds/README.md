# OmniAvatar reference turnarounds

These images are reconstruction inputs for the male and female OmniRave launch
avatars. Each set was generated from exactly one approved source image.

## Authority

- The original source image remains the authority for visible identity, anatomy,
  clothing, hair, materials, and accessories.
- Generated front, back, profile, and three-quarter views are inferred supporting
  views. Hidden surfaces are plausible reconstructions, not observed ground truth.
- A downstream reconstruction system must not treat disagreements between the
  original image and an inferred view as evidence that the original changed.

## View package

Each character folder contains:

- `front-v1.png`
- `back-v1.png`
- `left-profile-v1.png`
- `right-profile-v1.png`
- `front-three-quarter-v1.png`
- `rear-three-quarter-v1.png`
- `turnaround-sheet-v1.png`

All generated views use a neutral T-pose, uniform background, neutral studio
lighting, and approximately orthographic framing. The individual images are crops
from one jointly generated sheet to maximize cross-view consistency.

## Approved sources

- Male: `.superpowers/brainstorm/49113-1780456702/content/assets/avatar-luxury-festival.png`
- Female: `.superpowers/brainstorm/49113-1780456702/content/assets/avatar-plurr-warehouse.png`

## Production pipeline rule

Generate four to six consistent views of one identity in one neutral pose. Do not
generate unrelated action poses as geometry references. Before submitting the set
to a 3D provider, reject or regenerate it if face identity, body proportions,
hairstyle, clothing silhouette, accessory placement, left/right orientation, or
camera scale drifts between views.

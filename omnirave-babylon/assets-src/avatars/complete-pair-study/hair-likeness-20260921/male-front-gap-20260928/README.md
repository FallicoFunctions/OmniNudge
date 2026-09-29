# Male front underlay, 2026-09-28

The front of the male groom formed a dark, blunt band because the opaque
scalp carrier filled gaps beneath the swept locks. I softened the existing
cap's `MaleRearFinish` alpha on 143 front vertices. The hair cards, geometry,
rig, UVs, pigments, material, texture, and motion shapes are unchanged.
All three male GLBs and compressed downloads include the adjustment; female
assets were untouched.

The difference is visible in `candidate-front.png` and `candidate-oblique.png`
and subtle at review-page scale (`runtime-front.jpg`). The front still reads as
a heavy fringe. Further tests that lifted 839 front cards and separately
reduced overlapping fibers did not materially improve the silhouette, so
neither was delivered. A nape-card test covered the high fade but looked like
isolated strands; it was also rejected. The next useful step is to reshape the
front groom and build fuller rear/side mass as one coherent hairstyle, rather
than continue small opacity or card additions.

Validation: `native-checks.json` confirms all 44 mesh structures exact, with
only front scalp alpha changed. The 27 movement samples passed, all three
portable GLBs had zero validator errors, and `delivery-verification.json`
confirms only scalp coverage changed across the exports. The Babylon review
page loaded without browser errors. These checks do not assert visual likeness.

`before/` records the male source, downloads, and manifest before this pass.

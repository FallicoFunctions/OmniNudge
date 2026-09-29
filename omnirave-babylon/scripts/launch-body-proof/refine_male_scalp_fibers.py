"""Add visible, directional pigment to the male cap under the existing ribbons.

This edits only the cap's packed image and its finish.  No mesh, UV, skin,
outfit, or strand card changes.  Wavy pigment lanes follow the cap's UV flow;
the dark cap remains underpainting for the separately modeled hair strands.
"""
from pathlib import Path
import numpy as np
from PIL import Image


def build_texture(source: Path, destination: Path):
    original=np.asarray(Image.open(source).convert('RGBA'),dtype=np.uint8)
    height,width=original.shape[:2]
    yy,xx=np.mgrid[:height,:width]
    u=(xx+.5)/width
    v=(yy+.5)/height
    # Warp along the root-to-crown direction so the lanes are not vertical
    # barber stripes.  Use medium and fine widths that survive mipmapping.
    phase=2*np.pi*(54*u+0.33*v+0.023*np.sin(2*np.pi*(4*u+0.21*v)))
    crest=np.cos(phase+0.43*np.sin(2*np.pi*(7*u-0.34*v)))
    fine=np.cos(phase*1.87+0.9*np.sin(2*np.pi*(3*u+0.47*v)))
    broad=np.sin(2*np.pi*(13*u+0.28*v))
    value=np.clip(0.48+0.24*crest+0.11*fine+0.07*broad,0,1)
    # The cap remains darker than the separate long-hair cards. Preserve
    # existing edge coverage and transparency exactly.
    out=original.copy()
    out[:,:,0]=np.rint(4+8*value).astype(np.uint8)
    out[:,:,1]=np.rint(2+5*value).astype(np.uint8)
    out[:,:,2]=np.rint(1+3*value).astype(np.uint8)
    destination.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(out,'RGBA').save(destination)
    return {'size':[width,height], 'rgbRange':[[int(out[:,:,i].min()),int(out[:,:,i].max())] for i in range(3)],
            'alphaExact':bool(np.array_equal(out[:,:,3],original[:,:,3])),
            'originalRgbRange':[[int(original[:,:,i].min()),int(original[:,:,i].max())] for i in range(3)]}

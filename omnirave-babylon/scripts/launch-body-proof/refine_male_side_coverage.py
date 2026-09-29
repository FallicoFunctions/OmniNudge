"""Keep the lowered male side boundary visible under its rooted hair fibers."""
from pathlib import Path
import numpy as np
from PIL import Image


def reveal_side_coverage(source:Path,destination:Path):
    original=np.asarray(Image.open(source).convert('RGBA'),dtype=np.uint8)
    height,width=original.shape[:2]
    yy,xx=np.mgrid[:height,:width]
    u=(xx+.5)/width
    def smooth(x):
        x=np.clip(x,0,1)
        return x*x*(3-2*x)
    # Side sectors of the cap UV. Broad enough to cover the temples, with a
    # gradual seam into the untouched front and rear texture.
    right=smooth((u-.075)/.045)*(1-smooth((u-.360)/.055))
    left=smooth((u-.585)/.055)*(1-smooth((u-.880)/.045))
    side=np.maximum(right,left)
    faster=smooth(yy/12.0)
    old_alpha=original[:,:,3].astype(float)/255
    alpha=old_alpha*(1-side)+np.maximum(old_alpha,faster)*side
    out=original.copy()
    out[:,:,3]=np.rint(alpha*255).astype(np.uint8)
    destination.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(out,'RGBA').save(destination)
    changed=np.abs(out[:,:,3].astype(int)-original[:,:,3].astype(int))>0
    return {'size':[width,height],'changedAlphaPixels':int(changed.sum()),
            'maxAlphaChange':int(np.abs(out[:,:,3].astype(int)-original[:,:,3].astype(int)).max()),
            'rgbExact':bool(np.array_equal(out[:,:,:3],original[:,:,:3])),
            'transparentOuterRowExact':bool(np.array_equal(out[0,:,3],original[0,:,3])),
            'untouchedBelowTextureRow':int(np.max(np.where(changed)[0])) if changed.any() else None}

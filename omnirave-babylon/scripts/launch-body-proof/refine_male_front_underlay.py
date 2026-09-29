"""Open a measured gap in the male front cap beneath the swept locks.

The retained cap geometry, UVs, weights, head clearance, roots and texture stay
exact. Its existing COLOR_0 alpha is softened only on the lower front 22% of
the cap, with an asymmetric field under the falling locks. The rooted hairline
and main groom are left intact, so the detached lock tips remain visible.
"""
import bpy
import numpy as np

from assemble_complete_pair import array
from complete_pair_geometry import smooth


NAME = 'Complete scalp'
ATTRIBUTE = 'MaleRearFinish'


def open_front_underlay(mapping, report):
    ob = bpy.data.objects[NAME]
    points = array(ob)
    uv = np.zeros((len(points), 2))
    for loop in ob.data.loops:
        uv[loop.vertex_index] = ob.data.uv_layers.active.data[loop.index].uv
    attr = ob.data.color_attributes[ATTRIBUTE]
    before = np.asarray([item.color[:] for item in attr.data], dtype=np.float32)
    colors = before.copy()

    # The cap's UV rows run crown to hairline. Fade the last rows under the
    # three main front wave valleys, while leaving the temples and rear exact.
    front = smooth((-points[:, 1] - .082) / .055)
    center = 1 - smooth((np.abs(points[:, 0] + .004) - .030) / .030)
    lower = smooth((uv[:, 1] - .775) / .225)
    wave = .84 + .10 * np.sin(points[:, 0] * 135 + .45) + .06 * np.sin(points[:, 0] * 267 - .8)
    field = np.clip(front * center * lower * wave, 0, 1)
    colors[:, 3] *= (1 - .87 * field)
    assert np.array_equal(colors[:, :3], before[:, :3])
    assert np.array_equal(colors[points[:, 1] > -.082], before[points[:, 1] > -.082])
    assert np.array_equal(colors[uv[:, 1] <= .775], before[uv[:, 1] <= .775])
    assert (colors[:, 3] >= 0).all()
    attr.data.foreach_set('color', colors.ravel())
    mapping[NAME]['addedColors'] = colors.tolist()
    changed = np.flatnonzero(np.abs(colors[:, 3] - before[:, 3]) > 1e-6)
    assert 100 < len(changed) < 700, len(changed)
    summary = {
        'changedAlphaVertices': int(len(changed)),
        'minimumFrontFactor': float((colors[changed, 3] / before[changed, 3]).min()),
        'maximumFrontFactor': float((colors[changed, 3] / before[changed, 3]).max()),
        'meanChangedAlpha': float(colors[changed, 3].mean()),
        'geometryUvRgbWeightsMaterialsAndMorphsExact': True,
    }
    report[NAME] = {**report[NAME], 'frontUnderlayGap': summary}
    print('MALE_FRONT_UNDERLAY', summary, flush=True)
    return summary

"""Give the male fringe staggered, tapered falls and softer temple layers.

Connection map: the first two pairs of each retained hair ribbon stay fixed
on the lowered scalp. Free fringe ends overlap the rooted underlayer and turn
inward above the brows; temple ribbons overlap the existing ear-side layers.
Hair uses millimeter skin clearance rather than structural assembly overlap.
The existing origins, UVs, weights, topology and relative morphs are retained.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def soften_front_layers(mapping, report, apply):
    rig = bpy.data.objects['AvatarSkeleton']
    ob = bpy.data.objects['Luxury retained swept groom']
    original = array(ob); revised = original.copy(); components = islands(ob)
    ribbons = np.array([original[ids].reshape(12, 2, 3) for ids in components])
    paths = ribbons.mean(2); groups = group_paths(paths, 96)
    guides = {g: paths[groups == g].mean(0) for g in np.unique(groups)}
    t = np.linspace(0, 1, 12)
    free = smooth((t - 1/11)/.36); late = smooth((t-.28)/.72)
    eye_height = np.mean([array(bpy.data.objects['AvatarEye_'+s], True)[:,2].mean() for s in ['l','r']])
    counts = {'fallingFringeRibbons': 0, 'templeRibbons': 0}
    for i, (ids, ribbon) in enumerate(zip(components, ribbons)):
        g = int(groups[i]); guide = guides[g]; root = guide[0]; tip = guide[-1]
        phase = g*2.399963
        front = float(smooth((-root[1]-.090)/.035))
        falling = front*float(smooth((-tip[1]-.100)/.025))*float(smooth((1.766-tip[2])/.032))*float(smooth((-.005-tip[0])/.032))
        temple = float(smooth((abs(root[0])-.043)/.021))*float(smooth((tip[1]+.102)/.040))
        temple *= float(smooth((1.776-tip[2])/.045))
        weight = max(falling, temple)
        if weight < .015: continue
        c = paths[i].copy()
        # Long and short locks share one broad curve but do not finish on the
        # same horizontal line. Vary small sublocks rather than every fiber.
        subphase = (i//18)*2.399963
        drop = .013 + .010*(.5+.5*math.sin(phase+.5))
        stagger = .0045*math.sin(subphase)
        c[:,2] -= falling*(drop+stagger)*late
        c[:,0] += falling*(.014*late**2 - .005*np.sin(math.pi*late))
        c[:,1] -= falling*.004*np.sin(math.pi*t)*free
        c[:,0] += falling*.0025*math.sin(subphase)*late**2
        # Open the broad fringe belly into narrow nested curves. The rooted
        # volume stays fixed while free ends have more air between them.
        c += (paths[i]-guide)*(.24*free*falling)[:,None]
        # Relax the ear-side end direction toward the back of the head. Keep
        # the ear exposed and avoid extending a flat panel below its rim.
        c[:,1] += temple*(.006+.003*math.sin(phase))*late
        c[:,2] -= temple*(.004+.003*(.5+.5*math.cos(phase)))*late
        c[:,0] += np.sign(root[0])*temple*.002*np.sin(math.pi*t)*free
        c[:,2] += temple*.002*math.sin(subphase)*late
        relaxed = .12*c[:-2]+.76*c[1:-1]+.12*c[2:]
        c[2:-1] = relaxed[1:]
        if falling > .1: c[:,2] = np.maximum(c[:,2], eye_height+.018)
        c[:2] = paths[i,:2]
        half = (ribbon[:,1]-ribbon[:,0])*.5
        for j in range(2,12):
            old_tangent = Vector(paths[i,min(j+1,11)]-paths[i,j-1]).normalized()
            new_tangent = Vector(c[min(j+1,11)]-c[j-1]).normalized()
            taper = 1-falling*(.18*free[j]+.20*late[j])-temple*.12*free[j]
            half[j] = np.array(old_tangent.rotation_difference(new_tangent)@Vector(half[j]))*taper
        rr = np.stack([c-half,c+half],axis=1); rr[:2] = ribbon[:2]
        revised[ids] = rr.reshape(-1,3)
        counts['fallingFringeRibbons'] += int(falling>.3)
        counts['templeRibbons'] += int(temple>.3)
    # Earlier edge-by-edge fitting could turn a submillimeter ribbon into a
    # broad triangle. Restore a tapered width before fitting, then translate
    # both edges together so contact correction cannot widen the strip again.
    repaired = 0
    for ids in components:
        r = revised[ids].reshape(12,2,3).copy(); c = r.mean(1)
        half = (r[:,1]-r[:,0])*.5
        widths = np.linalg.norm(half,axis=1)*2
        cap = widths[0]*1.3*(1-.965*smooth((t-.45)/.55))
        valid = widths<=cap
        for j in range(2,12):
            if valid[j]: continue
            nearest = min(np.flatnonzero(valid),key=lambda k:abs(int(k)-j))
            tangent_before = Vector(c[min(nearest+1,11)]-c[max(nearest-1,0)]).normalized()
            tangent_after = Vector(c[min(j+1,11)]-c[j-1]).normalized()
            across = tangent_before.rotation_difference(tangent_after)@Vector(half[nearest]).normalized()
            half[j] = np.array(across)*cap[j]*.5
            repaired += 1
        rr = np.stack([c-half,c+half],axis=1); rr[:2] = r[:2]
        revised[ids] = rr.reshape(-1,3)
    fit_count = fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    previous = report.get(ob.name,{}).copy(); uv = mapping.get(ob.name,{}).get('addedUv')
    apply(ob,revised,mapping,report)
    pairs = fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    if uv is not None: mapping[ob.name]['addedUv'] = uv
    maximum = float(np.linalg.norm(array(ob)-original,axis=1).max()*1000)
    report[ob.name] = {**previous,**report[ob.name], 'softFrontLayers':True, 'maxMovementMm':maximum}
    result = {**counts,'fixedRootPairsPerRibbon':2,'eyeHeightM':float(eye_height),
              'skinFitVertices':fit_count,'evaluatedFitPairs':pairs,'maxMovementMm':maximum,
              'repairedWidePairs':repaired,'pairwiseSkinFitting':True,
              'preservedScalpUnderlayerAndFlyaways':True}
    print('MALE_FRONT_LAYERS',result,flush=True)
    return result

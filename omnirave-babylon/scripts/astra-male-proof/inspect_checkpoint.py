"""Inspect authoring geometry; this does not certify likeness or game readiness."""
import bpy,sys,json,math,hashlib,struct
from pathlib import Path
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/astra-male-proof'
name=sys.argv[sys.argv.index('--')+1]
if name not in {'fit05','curl18','face19'}:raise ValueError(name)
bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{name}.blend'))
body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton']
report={'checkpoint':name,'scope':'authoring structure only; no likeness or deformation acceptance',
        'body_vertices':len(body.data.vertices),'body_polygons':len(body.data.polygons),
        'body_topology_sha256':hashlib.sha256(b''.join(struct.pack('<I',v) for f in body.data.polygons for v in f.vertices)).hexdigest(),
        'rig_bones':len(rig.data.bones),'grooms':[],'missing_images':[],'likeness':'NOT_PASSED','runtime':'NOT_TESTED'}
for ob in bpy.data.objects:
    if ob.hide_render or ob.type!='CURVES':continue
    points=[ob.matrix_world@p.vector for p in ob.data.attributes['position'].data]
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    finite=all(math.isfinite(x) for p in points for x in p)
    attached=ob.parent==rig and ob.parent_type=='BONE' and ob.parent_bone=='head'
    report['grooms'].append({'name':ob.name,'strands':len(ob.data.curves),'points':len(points),'bounds':bounds,'finite':finite,'head_bone_parent':attached})
    assert finite and attached,(ob.name,'invalid geometry/attachment')
    assert bounds[2][0]>1.54 and bounds[2][1]<1.84,(ob.name,'hair escapes head region',bounds)
for img in bpy.data.images:
    if img.source=='FILE' and not img.packed_file and img.filepath and not Path(bpy.path.abspath(img.filepath)).exists():report['missing_images'].append(img.name)
assert not report['missing_images'],report['missing_images']
(OUT/f'landmarks/{name}-structure.json').write_text(json.dumps(report,indent=2)+'\n')
print('STRUCTURE_INSPECTED',name,report['body_vertices'],sum(g['strands'] for g in report['grooms']))

"""Probe actual exported triangles/skin by importing the delivered GLB into Blender.

This tests the export boundary, not Babylon GPU equivalence or coplanar overlap.
"""
from pathlib import Path
import argparse, hashlib, json, sys
import bpy
from mathutils.bvhtree import BVHTree

OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
parser=argparse.ArgumentParser()
parser.add_argument('--version', choices=['outfit01','outfit02','outfit03'], default='outfit03')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
stem='male-'+args.version;source=OUT/(stem+'.glb')
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=str(source))
shirt=bpy.data.objects['Luxury_Black shirt draft'];coat=bpy.data.objects['Luxury_Bomber continuous shell']
body=bpy.data.objects['AvatarBody'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
assert len(rig.data.bones)==56
action=rig.animation_data.action;first,last=action.frame_range
assert abs(last-first-150)<1e-4, (first,last)
rows=[]
for sample in range(151):
 frame=first+sample;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
 dg=bpy.context.evaluated_depsgraph_get()
 # Use world positions: the importer may introduce object transforms.
 def world_tree(obj):
  ev=obj.evaluated_get(dg);mesh=ev.to_mesh()
  points=[ev.matrix_world@v.co for v in mesh.vertices]
  faces=[list(f.vertices) for f in mesh.polygons]
  assert all(len(f)==3 for f in faces), 'Export must contain triangles'
  tree=BVHTree.FromPolygons(points,faces,all_triangles=True);ev.to_mesh_clear()
  return tree
 pairs=world_tree(shirt).overlap(world_tree(coat))
 rows.append({'sample':sample,'frame':frame,'crossing_triangle_pairs':len(pairs)})
summary={'sampled_frames':151,'frames_with_crossings':sum(r['crossing_triangle_pairs']>0 for r in rows),
         'maximum_pairs':max(r['crossing_triangle_pairs'] for r in rows)}
report={'source_sha256':source_hash,'scope':'Exported GLB triangles and animation reimported into Blender, 151 integer-frame samples. No coplanar, subframe, other-garment, self-intersection or Babylon GPU parity claim.',
        'imported_action_range':[first,last],'summary':summary,'poses':rows}
(OUT/(stem+'-exported-layer-check.json')).write_text(json.dumps(report,indent=2)+'\n')
print('EXPORTED_LAYER_CHECK',summary)

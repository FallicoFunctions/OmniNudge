"""Check current full-body/wardrobe probes after loading their saved sources."""
from pathlib import Path
import bpy,json,math,sys,hashlib,argparse
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
parser=argparse.ArgumentParser();parser.add_argument('--version',choices=['body02','body03'],default='body02')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);version=args.version;review_version=version.replace('body','review')
reports=[]
for sex in ['male','female']:
 bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{review_version}.blend'))
 body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton'];rows=[]
 assert not any(m.type=='MASK' and m.show_viewport for m in body.modifiers)
 assert len(body.data.vertices)==13380 and len(rig.data.bones)==56
 for frame in range(1,152):
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
  tree=BVHTree.FromObject(body,dg)
  ev=body.evaluated_get(dg);mesh=ev.to_mesh();coords=[v.co.copy() for v in mesh.vertices];ev.to_mesh_clear()
  assert len(coords)==13380 and all(math.isfinite(x) for v in coords for x in v)
  foot_count=sum(v.z<.10 for v in coords);assert foot_count>100,(sex,frame,foot_count)
  garments={}
  for name in ['AvatarTop_ribbed-tank','AvatarTop_mesh-crop','AvatarBottoms_tech-joggers']:
   ob=bpy.data.objects[name];ev=ob.evaluated_get(dg);mesh=ev.to_mesh();worst=0;bad=0
   for v in mesh.vertices:
    point=body.matrix_world.inverted()@ob.matrix_world@v.co
    hit,normal,_,dist=tree.find_nearest(point)
    signed=(point-hit).dot(normal)
    if signed<-.002:bad+=1;worst=min(worst,signed)
   garments[name]={'vertices':len(mesh.vertices),'samples_inside_body_beyond_2mm':bad,'deepest_signed_distance_m':worst};ev.to_mesh_clear()
  rows.append({'frame':frame,'complete_body_vertices':len(coords),'foot_vertices_below_10cm':foot_count,'garments':garments})
 reports.append({'character':sex,'source_sha256':hashlib.sha256((OUT/f'{sex}-{review_version}.blend').read_bytes()).hexdigest(),'sample_interval_frames':1,'poses':rows,'scope':'finite/full-body and nearest-surface garment diagnostics, not a full collision or animation acceptance test'})
(OUT/('deformation-check.json' if version=='body02' else f'{version}-deformation-check.json')).write_text(json.dumps(reports,indent=2)+'\n')
for report in reports:
 counts=[sum(g['samples_inside_body_beyond_2mm'] for g in p['garments'].values()) for p in report['poses']]
 print('FULL_BODY_DEFORMATION_CHECK',report['character'],'frames',len(counts),'frames_with_findings',sum(c>0 for c in counts),'peak_affected_vertices',max(counts))

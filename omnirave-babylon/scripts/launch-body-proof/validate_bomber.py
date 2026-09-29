"""Inspect every integer frame against the unmasked body; never a full collision proof."""
from pathlib import Path
import bpy,bmesh,json,math,hashlib,sys,argparse
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
parser=argparse.ArgumentParser();parser.add_argument('--version',choices=['outfit01','outfit02','outfit03'],default='outfit01')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
stem='male-'+args.version
source=OUT/(stem+'.blend');source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
def identity():
 body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton']
 data={'vertices':[list(v.co) for v in body.data.vertices], 'polygons':[list(p.vertices) for p in body.data.polygons],
       'weights':[[(body.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in body.data.vertices],
       'bones':[(b.name,list(b.head_local),list(b.tail_local),b.parent.name if b.parent else None) for b in rig.data.bones]}
 return hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(OUT/'male-review03.blend'));body_identity=identity()
def garment_identity():
 return {o.name:hashlib.sha256(json.dumps({'vertices':[list(v.co) for v in o.data.vertices],
         'polygons':[list(p.vertices) for p in o.data.polygons],
         'weights':[[(o.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in o.data.vertices]},sort_keys=True).encode()).hexdigest()
         for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('Luxury_')}
previous_garments={}
if args.version=='outfit03':
 bpy.ops.wm.open_mainfile(filepath=str(OUT/'male-outfit02.blend'));previous_garments=garment_identity()
bpy.ops.wm.open_mainfile(filepath=str(source))
assert identity()==body_identity, 'Wardrobe build changed body geometry, weights, or skeleton'
unchanged_details=[];changed_garments=[]
if previous_garments:
 current_garments=garment_identity();assert current_garments.keys()==previous_garments.keys()
 changed_garments=[name for name,value in current_garments.items() if value!=previous_garments[name]]
 unchanged_details=[name for name,value in current_garments.items() if value==previous_garments[name]]
 assert set(changed_garments)<= {'Luxury_Black shirt draft','Luxury_Bomber continuous shell'}, changed_garments

body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton'];rows=[]
garments=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('Luxury_')]
topology={};fabric_thickness={}
for obj in garments:
 bm=bmesh.new();bm.from_mesh(obj.data)
 topology[obj.name]={'vertices':len(bm.verts),'faces':len(bm.faces),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces)}
 bm.free()
 if obj.name in ['Luxury_Black shirt draft','Luxury_Bomber continuous shell']:
  count=len(obj.data.vertices)//2;ds=sorted((obj.data.vertices[i].co-obj.data.vertices[i+count].co).length for i in range(count))
  fabric_thickness[obj.name]={'minimum_rest_m':ds[0],'median_rest_m':ds[count//2],'maximum_rest_m':ds[-1],'pairs_over_3mm':sum(d>.003 for d in ds)}
assert len(body.data.vertices)==13380 and len(rig.data.bones)==56
assert all(m.type!='MASK' or not m.show_viewport for m in body.modifiers)
for frame in range(1,152):
 bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();tree=BVHTree.FromObject(body,dg);parts={}
 for o in garments:
  e=o.evaluated_get(dg);m=e.to_mesh();bad=0;worst=0
  for v in m.vertices:
   assert all(math.isfinite(x) for x in v.co)
   h,n,_,_=tree.find_nearest(v.co);signed=(v.co-h).dot(n)
   if signed<-.002:bad+=1;worst=min(worst,signed)
  parts[o.name]={'vertices':len(m.vertices),'inside_samples_beyond_2mm':bad,'worst_distance_m':worst};e.to_mesh_clear()
 rows.append({'frame':frame,'parts':parts})
flagged=[r for r in rows if any(p['inside_samples_beyond_2mm'] for p in r['parts'].values())]
summary={'sampled_frames':len(rows),'flagged_frames':len(flagged),'maximum_flagged_vertices_per_frame':max(sum(p['inside_samples_beyond_2mm'] for p in r['parts'].values()) for r in rows),'worst_distance_m':min(p['worst_distance_m'] for r in rows for p in r['parts'].values())}
(OUT/(stem+'-deformation-check.json')).write_text(json.dumps({'changed_garments_from_outfit02':changed_garments,'unchanged_garments_from_outfit02':unchanged_details,'fabric_thickness':fabric_thickness,'mesh_topology':topology,'unchanged_body_and_rig_sha256':body_identity,'source_sha256':source_hash,'scope':'151-frame finite geometry and nearest-body vertex diagnostic; not garment-to-garment, triangle, subframe, or gameplay acceptance','summary':summary,'poses':rows},indent=2)+'\n')
print('BOMBER_FIT',summary)

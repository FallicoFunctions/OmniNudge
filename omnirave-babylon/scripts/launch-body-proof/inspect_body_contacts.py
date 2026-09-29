from pathlib import Path
import sys,bpy,json,collections
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT,review
from surface_crossings import strict_pairs
rows=[]
for sex in ['male','female']:
 bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-body04.blend'))
 body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
 print('GROUPS',sex,[g.name for g in body.vertex_groups])
 for frame in [0,1,31,61,91,121]:
  rig.data.pose_position='REST' if frame==0 else 'POSE';scene.frame_set(max(1,frame));bpy.context.view_layer.update()
  ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();mesh.calc_loop_triangles()
  pts=[v.co.copy() for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles];pairs=strict_pairs(pts,tris)
  bins=collections.Counter();samples=[]
  for a,b in pairs:
   c=sum((pts[i] for i in tris[a]),Vector())/3;bins[tuple(round(x,2 if c.z<.2 else 1) for x in c)]+=1
   if len(samples)<6 or (c.z>.3 and len(samples)<12):samples.append({'triangles':[a,b],'polygons':[mesh.loop_triangles[t].polygon_index for t in [a,b]],'posed_points':[[list(pts[i]) for i in tris[t]] for t in [a,b]],'vertices':[list(tris[t]) for t in [a,b]],'weights':[[[(body.vertex_groups[g.group].name,g.weight) for g in body.data.vertices[i].groups] for i in tris[t]] for t in [a,b]]})
  print('CONTACTS',sex,frame,len(pairs),bins.most_common(15))
  rows.append({'sex':sex,'frame':frame,'pairs':len(pairs),'samples':samples,'regions':[{'xyz':k,'pairs':v} for k,v in bins.items()]})
  if frame==1:
   badfaces={mesh.loop_triangles[t].polygon_index for a,b in pairs for t in [a,b] if all(pts[i].z<.15 for i in tris[t])}
  ev.to_mesh_clear()
 scene.frame_set(1);bpy.context.view_layer.update()
 for obj in bpy.data.objects:
  if obj.type=='MESH':obj.hide_render=obj!=body
 gray=bpy.data.materials.new('Diagnostic gray');gray.use_nodes=True;gray.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.4,.45,.5,1)
 red=bpy.data.materials.new('Confirmed crossing faces');red.use_nodes=True;red.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.8,.01,.005,1)
 body.data.materials.clear();body.data.materials.append(gray);body.data.materials.append(red)
 for p in body.data.polygons:p.material_index=int(p.index in badfaces)
 camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.48;camera.location=(.3,-.7,.5);review.look_at(camera,Vector((0,-.1,.03)))
 scene.render.resolution_x=960;scene.render.resolution_y=700;scene.render.filepath=str(OUT/f'{sex}-body04-feet-diagnostic.png');bpy.ops.render.render(write_still=True)
(OUT/'body04-contact-inspection.json').write_text(json.dumps(rows,indent=2))

"""Simulate the rebuilt panel through a temporary arm-lowering schedule.

The T-pose rest surface and attachment targets are separate. A unit-scaled
copy permits submillimeter physical collision distances despite Blender's
hard parameter minimums. Requested and effective distances must match before
simulation begins. Results are converted back to meters for triangle probes.

This is a midsurface experiment with a changed sampling schedule: stationary
T-pose, the original T-pose-to-relaxed motion, then settling. It is not the
original five-second source/export validation, a full garment test, or a
portable rig solution. No model, animation or cloth cache is saved. Triangle probes run at frames 1, 11, 31, 51, 71 and 101. They exclude
adjacent and coplanar self-contact. A failed warm-up or sampled contact keeps
the result unpromoted.
"""
from pathlib import Path
import argparse,bpy,json,sys,hashlib
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from rebuild_bomber_underarm import rebuild,P
from validate_body05_tops import geometry,between
from surface_crossings import strict_pairs

def simulate(sim_scale=10.):
 state=rebuild(.14)
 s,rig,coat,body,top=[state[name] for name in ['scene','rig','coat','body','top']]
 pp,maps,anchors,free,groupnames,pw,faces,skin=[state[name] for name in ['panel_points_tpose','maps','anchors','free','groupnames','panel_weights','panel_faces','skin']]
 rows=[]
 # Simulate only the newly sewn midsurface. Pins are its measured boundary.
 # The unchanged control source is never saved with this temporary schedule.
 captured=[];attachment_positions=[]
 for sample in range(61):
  frame=31-sample*.5;s.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();captured.append({b.name:b.matrix_basis.copy() for b in rig.pose.bones});posed_coat,_=geometry(coat);attachment_positions.append({i:(posed_coat[maps[0][i]]+posed_coat[maps[1][i]])*.5 for i in anchors})
 rig.animation_data_clear()
 for pose in captured:
  for matrix in pose.values():matrix.translation*=sim_scale
 for pose in attachment_positions:
  for point in pose.values():point*=sim_scale
 for ob in [body,top,coat]:
  for vertex in ob.data.vertices:vertex.co*=sim_scale
  ob.data.update()
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 for bone in rig.data.edit_bones:bone.head*=sim_scale;bone.tail*=sim_scale
 bpy.ops.object.mode_set(mode='OBJECT')
 for dst,src in [(1,0)]+[(11+i,i) for i in range(61)]+[(101,60)]:
  for bone in rig.pose.bones:
   bone.matrix_basis=captured[src][bone.name];bone.keyframe_insert(data_path='location',frame=dst);bone.keyframe_insert(data_path='rotation_quaternion',frame=dst);bone.keyframe_insert(data_path='scale',frame=dst)
 s.frame_start=1;s.frame_end=101;s.frame_set(1);bpy.context.view_layer.update()
 cloth_mesh=bpy.data.meshes.new('Sewn panel simulation surface');cloth_points=[];cloth_weights=[]
 for i in range(len(pp)):
  if i in anchors:
   vi=maps[0][i];mix={g.group:g.weight for g in coat.data.vertices[vi].groups}
  else:mix=pw[i]
  matrix=Matrix(((0,0,0,0),)*4)
  for gi,weight in mix.items():matrix+=skin[groupnames[gi]]*weight
  cloth_points.append(pp[i]*sim_scale);cloth_weights.append(mix)
 cloth_mesh.from_pydata(cloth_points,[],faces);cloth_mesh.update();cloth_obj=bpy.data.objects.new('Sewn patch physics trial',cloth_mesh);s.collection.objects.link(cloth_obj)
 for name in groupnames:cloth_obj.vertex_groups.new(name=name)
 for vert,mix in zip(cloth_mesh.vertices,cloth_weights):
  for gi,weight in mix.items():cloth_obj.vertex_groups[gi].add([vert.index],weight,'REPLACE')
 basis_key=cloth_obj.shape_key_add(name='T-pose rest surface');cloth_obj.data.shape_keys.use_relative=False
 for sample in range(61):
  key=cloth_obj.shape_key_add(name=f'Attachment sample {sample}');key.interpolation='KEY_LINEAR'
  for i,point in attachment_positions[sample].items():key.data[i].co=point
  cloth_obj.data.shape_keys.eval_time=key.frame;cloth_obj.data.shape_keys.keyframe_insert(data_path='eval_time',frame=11+sample)
 cloth_obj.data.shape_keys.eval_time=0;cloth_obj.data.shape_keys.keyframe_insert(data_path='eval_time',frame=1)
 cloth_obj.data.shape_keys.eval_time=cloth_obj.data.shape_keys.key_blocks[-1].frame;cloth_obj.data.shape_keys.keyframe_insert(data_path='eval_time',frame=101)
 s.frame_set(1);bpy.context.view_layer.update()
 pin=cloth_obj.vertex_groups.new(name='Boundary pins')
 for i in anchors:pin.add([i],1.,'REPLACE')
 for ob in [body,top]:
  collision=ob.modifiers.new('Temporary panel collision','COLLISION');ob.collision.thickness_outer=.0002*sim_scale;ob.collision.thickness_inner=.0002*sim_scale
 cloth=cloth_obj.modifiers.new('Sewn panel drape','CLOTH');sett=cloth.settings;sett.quality=20;sett.mass=.015;sett.tension_stiffness=60;sett.compression_stiffness=60;sett.shear_stiffness=30;sett.bending_stiffness=.2;sett.air_damping=5;sett.vertex_group_mass=pin.name;sett.pin_stiffness=1;sett.use_dynamic_mesh=False
 sett.effector_weights.gravity=0
 cs=cloth.collision_settings;cs.use_collision=True;cs.distance_min=.0002*sim_scale;cs.collision_quality=10;cs.use_self_collision=True;cs.self_distance_min=.0004*sim_scale;cs.self_friction=5
 effective={'cloth_body_m':cs.distance_min/sim_scale,'cloth_self_m':cs.self_distance_min/sim_scale,'body_outer_m':body.collision.thickness_outer/sim_scale,'body_inner_m':body.collision.thickness_inner/sim_scale,'top_outer_m':top.collision.thickness_outer/sim_scale,'top_inner_m':top.collision.thickness_inner/sim_scale}
 requested={name:(.0004 if name=='cloth_self_m' else .0002) for name in effective};calibration={'requested_m':requested,'effective_m':effective,'passed':all(abs(effective[name]-value)<1e-8 for name,value in requested.items())}
 report={'source':'male-outfit04.blend','source_sha256':hashlib.sha256((P/'male-outfit04.blend').read_bytes()).hexdigest(),'scope':__doc__,'simulation_scale':sim_scale,'calibration':calibration,'samples':rows,'passed':False,'status':'CONFIGURATION_REJECTED' if not calibration['passed'] else 'SIMULATION_IN_PROGRESS'}
 output=P/f'male-outfit04-panel-cloth-scale{sim_scale:g}.json'
 output.write_text(json.dumps(report,indent=2)+'\n')
 if not calibration['passed']:raise ValueError('Blender clamped the requested collision distances; use a larger simulation scale and verify effective values')
 print('EFFECTIVE_PHYSICS_M',cs.distance_min/sim_scale,cs.self_distance_min/sim_scale,body.collision.thickness_outer/sim_scale,flush=True)
 cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=101
 for frame in range(1,102):
  s.frame_set(frame);bpy.context.view_layer.update();dp,dt=geometry(cloth_obj);dp=[point/sim_scale for point in dp]
  if frame%10==0:print('PANEL_CLOTH_STEP',frame,flush=True)
  if frame in [1,11,31,51,71,101]:
   q,u=geometry(body);v,w=geometry(top);q=[point/sim_scale for point in q];v=[point/sim_scale for point in v]
   if frame in [11,71,101]:
    source_index=0 if frame==11 else 60;error=max(abs(bone.matrix_basis[a][b]-captured[source_index][bone.name][a][b]) for bone in rig.pose.bones for a in range(4) for b in range(4));assert error<1e-5,error
   row={'frame':frame,'midsurface_self':len(strict_pairs(dp,dt)),'body':len(between(dp,dt,q,u)),'top':len(between(dp,dt,v,w)),'max_span_m':max((a-b).length for a in dp for b in dp)};rows.append(row);print('PANEL_CLOTH_RESULT',row,flush=True)
   output.write_text(json.dumps(report,indent=2)+'\n')
   if frame==11 and (row['midsurface_self']>rows[0]['midsurface_self']+10 or row['body'] or row['top']):
    print('REJECTED_STATIONARY_WARMUP',flush=True);break
 report['completed_frame']=frame;report['passed']=frame==101 and all(not any(row[key] for key in ['midsurface_self','body','top']) for row in rows)
 report['status']='DIAGNOSTIC_CLEAR_NOT_PROMOTED' if report['passed'] else 'NOT_PROMOTED_CONTACT_CHECK_FAILED'
 assert hashlib.sha256((P/'male-outfit04.blend').read_bytes()).hexdigest()==report['source_sha256']
 report['source_file_preserved']=True
 output.write_text(json.dumps(report,indent=2)+'\n')
 return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--scale',type=float,choices=[1.,10.],default=10.);parser.add_argument('--require-clear',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 report=simulate(args.scale)
 if args.require_clear:assert report['passed'],'Panel cloth trial still has contacts; no model was saved'

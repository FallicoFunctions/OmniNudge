"""Replace a geodesic underarm disk with a sewn, reference-shaped panel.

One left-side panel on the retained outfit04 control. Its exact boundary is
shared with the surrounding jacket. A positive harmonic parameterization
resamples the existing T-pose shape onto constrained Delaunay triangles;
interior weights interpolate from the attachment boundary. The 1 mm paired
walls retain their shared diagonal. Rest and five poses are diagnostic only:
changed triangle counts are not directly comparable severity measurements.
No model is saved, promoted or exported. Shape, interpolation, actual GLB and
other motion would need separate validation before use.
"""
# Connection map: remove one disk from both left-underarm fabric walls.
# The new panel shares every existing boundary vertex; no overlap or seam gap.
# Outside jacket vertices and weights, body, top and skeleton stay unchanged.
import bpy,bmesh,sys,json,heapq,math,hashlib,argparse,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.geometry import delaunay_2d_cdt,barycentric_transform
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from validate_body05_tops import geometry,between,body_snapshot
from surface_crossings import strict_pairs
P=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
from validate_body_contacts import bones_snapshot
def rebuild(radius=.14):
 bpy.ops.wm.open_mainfile(filepath=str(P/'male-outfit04.blend'));s=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Luxury_Bomber rebuilt shell'];body=bpy.data.objects['AvatarBody'];top=bpy.data.objects['AvatarTop_tailored'];original_body=body_snapshot(body);original_top=body_snapshot(top);original_bones=bones_snapshot(rig);s.frame_set(31);bpy.context.view_layer.update();ref,tris=geometry(coat);h=len(ref)//2;mid=[(ref[i]+ref[i+h])*.5 for i in range(h)];mt=[tuple(f.vertices) for f in coat.data.polygons if max(f.vertices)<h];mfi=[f.index for f in coat.data.polygons if max(f.vertices)<h];skin={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
 adj=[set() for _ in range(h)]
 for a,b,c in mt:
  for x,y in [(a,b),(b,c),(c,a)]:adj[x].add(y);adj[y].add(x)
 seed=min(range(h),key=lambda i:(mid[i]-Vector((.215,0,1.36))).length);dist=[float('inf')]*h;dist[seed]=0;heap=[(0,seed)]
 while heap:
  d,i=heapq.heappop(heap)
  if d>dist[i]+1e-12:continue
  for j in adj[i]:
   nd=d+(mid[i]-mid[j]).length
   if nd<dist[j]:dist[j]=nd;heapq.heappush(heap,(nd,j))
 chosen={i for i,t in enumerate(mt) if sum(dist[v] for v in t)/3<radius}
 edge_faces={}
 for fi,t in enumerate(mt):
  for a,b in zip(t,t[1:]+t[:1]):edge_faces.setdefault(tuple(sorted((a,b))),[]).append(fi)
 # Fill isolated triangular notches until the patch boundary is one simple loop.
 for _ in range(12):
  directed=[]
  for fi in chosen:
   t=mt[fi]
   for a,b in zip(t,t[1:]+t[:1]):
    if sum(f in chosen for f in edge_faces[tuple(sorted((a,b)))])==1:directed.append((a,b))
  outgoing={}
  for a,b in directed:outgoing.setdefault(a,[]).append(b)
  branching={a for a,bs in outgoing.items() if len(bs)!=1}
  if not branching:break
  chosen|={fi for fi,t in enumerate(mt) if any(v in branching for v in t)}
 assert not branching
 start=directed[0][0];loop=[start]
 while True:
  nxt=outgoing[loop[-1]][0]
  if nxt==start:break
  assert nxt not in loop;loop.append(nxt)
 assert len(loop)==len(directed),(len(loop),len(directed))
 assert all(coat.data.polygons[mfi[fi]].material_index==0 for fi in chosen),'Patch reaches ribbing'
 lengths=[(mid[loop[(i+1)%len(loop)]]-mid[v]).length for i,v in enumerate(loop)];total=sum(lengths);arc=0.;uv=[]
 for length in lengths:uv.append(Vector((math.cos(2*math.pi*arc/total),math.sin(2*math.pi*arc/total))));arc+=length
 nbound=len(uv)
 # Flatten the original topological disk with a positive-weight embedding.
 # New triangles sample its existing T-pose shape, avoiding the shrinkage of
 # an unconstrained minimal surface between the attachment edges.
 selected_vertices=sorted({v for i in chosen for v in mt[i]});boundary_uv={v:uv[i] for i,v in enumerate(loop)};inside=[v for v in selected_vertices if v not in boundary_uv];inside_map={v:i for i,v in enumerate(inside)};selected_set=set(selected_vertices)
 H=np.zeros((len(inside),len(inside)));D=np.zeros((len(inside),2))
 for vertex,ii in inside_map.items():
  ns=adj[vertex]&selected_set;H[ii,ii]=len(ns)
  for n in ns:
   if n in inside_map:H[ii,inside_map[n]]-=1
   else:D[ii]+=np.array(boundary_uv[n])
 inside_uv=np.linalg.solve(H,D);chart={v:boundary_uv[v] if v in boundary_uv else Vector(inside_uv[inside_map[v]]) for v in selected_vertices};si={v:i for i,v in enumerate(selected_vertices)};chart_faces=[tuple(si[v] for v in mt[i]) for i in chosen];chart_points=[Vector((chart[v].x,chart[v].y,0)) for v in selected_vertices];chart_tree=BVHTree.FromPolygons(chart_points,chart_faces,all_triangles=True)
 for yi in range(-5,6):
  for xi in range(-5,6):
   x=xi*.16+(yi%2)*.08;y=yi*.16
   if x*x+y*y<.84**2:uv.append(Vector((x,y)))
 verts,edges,faces,orig,_,_=delaunay_2d_cdt(uv,[],[list(range(nbound))],1,1e-7,True)
 anchors={i:loop[next(j for j in ids if j<nbound)] for i,ids in enumerate(orig) if any(j<nbound for j in ids)};assert len(anchors)==nbound
 free=[i for i in range(len(verts)) if i not in anchors];fi={v:i for i,v in enumerate(free)};bi={v:i for i,v in enumerate(anchors)};graph=[set() for _ in verts]
 for a,b in edges:graph[a].add(b);graph[b].add(a)
 A=np.zeros((len(free),len(free)));B=np.zeros((len(free),nbound))
 for v,idx in fi.items():
  A[idx,idx]=len(graph[v])
  for n in graph[v]:
   if n in fi:A[idx,fi[n]]-=1
   else:B[idx,bi[n]]+=1
 coeff=np.linalg.solve(A,B);assert np.max(abs(coeff.sum(axis=1)-1))<1e-8 and coeff.min()>-1e-8
 boundary=list(anchors);coords=coeff@np.array([mid[anchors[i]] for i in boundary]);pp=[mid[anchors[i]].copy() if i in anchors else Vector(coords[fi[i]]) for i in range(len(verts))]
 for i in free:
  query=Vector((verts[i].x,verts[i].y,0));hit,n,index,d=chart_tree.find_nearest(query);assert d<1e-5
  ids=chart_faces[index];bary=barycentric_transform(hit,*[chart_points[j] for j in ids],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
  pp[i]=sum((mid[selected_vertices[j]]*weight for j,weight in zip(ids,bary)),Vector())
 groupnames=[g.name for g in coat.vertex_groups];wb=np.zeros((nbound,len(groupnames)))
 for j,ai in enumerate(boundary):
  for g in coat.data.vertices[anchors[ai]].groups:wb[j,g.group]=g.weight
 interp=coeff@wb;pw={i:dict(sorted(enumerate(interp[fi[i]]),key=lambda x:-x[1])[:4]) for i in free}
 for i,mix in pw.items():
  total=sum(mix.values());pw[i]={g:w/total for g,w in mix.items() if w>1e-8}
 original_patch={mfi[i] for i in chosen};patch_vertices={v for i in chosen for v in mt[i]};interior=patch_vertices-set(loop)
 # Identify both walls by their original triangle vertex sets.
 removed_keys={frozenset(mt[i]) for i in chosen}|{frozenset(v+h for v in mt[i]) for i in chosen}
 keep_faces=[f for f in coat.data.polygons if frozenset(f.vertices) not in removed_keys]
 used=sorted({v for f in keep_faces for v in f.vertices});oldmap={v:i for i,v in enumerate(used)};points=[coat.data.vertices[i].co.copy() for i in used];ws=[{g.group:g.weight for g in coat.data.vertices[i].groups} for i in used];newfaces=[tuple(oldmap[i] for i in f.vertices) for f in keep_faces];materials=[f.material_index for f in keep_faces]
 normals=[Vector() for _ in pp]
 for a,b,c in faces:
  n=(pp[b]-pp[a]).cross(pp[c]-pp[a])
  for i in (a,b,c):normals[i]+=n
 maps=[]
 for wall in [0,1]:
  lookup={i:oldmap[a+wall*h] for i,a in anchors.items()}
  for i in free:
   target=pp[i]+normals[i].normalized()*(.0005 if wall==0 else -.0005);m=Matrix(((0,0,0,0),)*4)
   for g,w in pw[i].items():m+=skin[groupnames[g]]*w
   lookup[i]=len(points);points.append(m.inverted()@target);ws.append(pw[i])
  maps.append(lookup)
 new_start=len(newfaces)
 for wall in [0,1]:
  for face in faces:newfaces.append(tuple(maps[wall][i] for i in (face if wall==0 else list(reversed(face)))));materials.append(0)
 mesh=bpy.data.meshes.new('Sewn left underarm panel trial');mesh.from_pydata(points,[],newfaces);mesh.update();oldmesh=coat.data
 for mat in oldmesh.materials:mesh.materials.append(mat)
 coat.data=mesh
 assert len(coat.vertex_groups)==0
 for name in groupnames:coat.vertex_groups.new(name=name)
 for v,mix in zip(mesh.vertices,ws):
  for g,w in mix.items():coat.vertex_groups[g].add([v.index],w,'REPLACE')
 for f,mi in zip(mesh.polygons,materials):f.material_index=mi;f.use_smooth=True
 bm=bmesh.new();bm.from_mesh(mesh);topology={'nonmanifold':sum(not e.is_manifold for e in bm.edges),'inconsistent_orientation':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),'degenerate':sum(f.calc_area()<1e-12 for f in bm.faces)};bm.free();assert not any(topology.values()),topology
 print('PANEL_BUILD',radius,'boundary',nbound,'old_triangles',len(chosen)*2,'new_triangles',len(faces)*2,'interior_vertices',len(free),flush=True)
 assert body_snapshot(body)==original_body and body_snapshot(top)==original_top and bones_snapshot(rig)==original_bones
 for original,index in oldmap.items():
  assert tuple(mesh.vertices[index].co)==tuple(oldmesh.vertices[original].co)
  assert {g.group:g.weight for g in mesh.vertices[index].groups}=={g.group:g.weight for g in oldmesh.vertices[original].groups}
 return {'scene':s,'rig':rig,'coat':coat,'body':body,'top':top,'panel_start_face':new_start,'panel_faces':faces,'panel_points_tpose':pp,'anchors':anchors,'free':free,'maps':maps,'groupnames':groupnames,'panel_weights':pw,'skin':skin,'boundary_count':nbound,'removed_triangles':len(chosen)*2,'added_triangles':len(faces)*2,'topology':topology,'body_top_skeleton_preserved':True,'retained_jacket_vertices_weights_exact':True}

def inspect(radius=.14,render=False):
 state=rebuild(radius);s,rig,coat,body,top=[state[name] for name in ['scene','rig','coat','body','top']];start=state['panel_start_face'];rows=[]
 from surface_crossings import crossing
 fixture=json.loads((P/'top01-diagonal-control.json').read_text());detected=sum(crossing(*[[Vector(point) for point in tri] for tri in example['points']]) for example in fixture['examples']);assert detected==8
 for frame in [0,1,31,61,91,121]:
  rig.data.pose_position='REST' if frame==0 else 'POSE';s.frame_set(max(1,frame));bpy.context.view_layer.update();p,t=geometry(coat);q,u=geometry(body);v,w=geometry(top);sh=strict_pairs(p,t);bh=between(p,t,q,u);th=between(p,t,v,w)
  row={'frame':frame,'self_pairs':len(sh),'body_pairs':len(bh),'top_pairs':len(th),'panel_self_pairs':sum(a>=start or b>=start for a,b in sh),'panel_body_pairs':sum(a>=start for a,b in bh),'panel_top_pairs':sum(a>=start for a,b in th)};rows.append(row);print('SEWN_PANEL_PROBE',row,flush=True)
 report={'source':'male-outfit04.blend','source_sha256':hashlib.sha256((P/'male-outfit04.blend').read_bytes()).hexdigest(),'scope':__doc__,'radius_m':radius,'boundary_vertices_per_wall':state['boundary_count'],'removed_triangles':state['removed_triangles'],'added_triangles':state['added_triangles'],'new_topology':state['topology'],'body_top_skeleton_preserved':state['body_top_skeleton_preserved'],'retained_jacket_vertices_weights_exact':state['retained_jacket_vertices_weights_exact'],'recorded_crossing_control_detected':detected,'poses':rows,'passed':all(not any(row[key] for key in ['self_pairs','body_pairs','top_pairs']) for row in rows),'status':'EXPERIMENT_ONLY_NO_MODEL_SAVED'}
 (P/'male-outfit04-underarm-panel.json').write_text(json.dumps(report,indent=2)+'\n')
 if render:
  from build_bodies import review
  rig.data.pose_position='POSE';s.frame_set(1);green=bpy.data.materials.new('Replacement underarm panel');green.use_nodes=True;green.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.025,.30,.09,1);green.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.7;slot=len(coat.data.materials);coat.data.materials.append(green)
  for face in coat.data.polygons:
   if face.index>=start:face.material_index=slot
  camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.72;camera.location=(3,-4,1.38);review.look_at(camera,Vector((.12,0,1.37)));s.render.resolution_x=900;s.render.resolution_y=900;s.render.filepath=str(P/'male-outfit04-underarm-panel.png');bpy.ops.render.render(write_still=True)
 return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--radius',type=float,choices=[.10,.14,.18],default=.14);parser.add_argument('--render',action='store_true');parser.add_argument('--require-clear',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 report=inspect(args.radius,args.render)
 if args.require_clear:assert report['passed'],'Replacement underarm panel still has contacts; no model was saved'

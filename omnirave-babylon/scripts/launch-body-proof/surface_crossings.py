"""Strict non-coplanar crossings between non-adjacent triangles."""
from mathutils.bvhtree import BVHTree

def pierces(start,end,tri):
 a,b,c=tri;direction=end-start;e1=b-a;e2=c-a;h=direction.cross(e2);det=e1.dot(h)
 if abs(det)<1e-12:return False
 s=start-a;u=s.dot(h)/det;q=s.cross(e1);v=direction.dot(q)/det;t=e2.dot(q)/det
 return 1e-6<t<1-1e-6 and u>1e-6 and v>1e-6 and u+v<1-1e-6

def crossing(a,b):
 return any(pierces(a[i],a[(i+1)%3],b) or pierces(b[i],b[(i+1)%3],a) for i in range(3))

def strict_pairs(points,tris,vertex_ids=None):
 # GLB UV/normal seams duplicate a physical vertex. Its bind position and
 # skin weights establish adjacency even when buffer indices differ.
 logical=[set(t) for t in tris] if vertex_ids is None else [{vertex_ids[i] for i in t} for t in tris]
 tree=BVHTree.FromPolygons(points,tris,all_triangles=True)
 return [(a,b) for a,b in tree.overlap(tree) if a<b and not logical[a].intersection(logical[b])
         and crossing([points[i] for i in tris[a]],[points[i] for i in tris[b]])]

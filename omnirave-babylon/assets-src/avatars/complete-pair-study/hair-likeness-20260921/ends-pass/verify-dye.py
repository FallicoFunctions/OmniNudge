from pathlib import Path
import struct,json
p=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921');m=json.loads((p/'female-vertex-mapping.json').read_text())['PLURR pony strands 0'];key=lambda p:tuple(round(x,6) for x in p)
expected={key(point):c for point,c in zip(m['after'],m['addedColors'])};report={}
for suffix in ['', '-lod1','-lod2']:
 name='female'+suffix+'.glb';b=(Path('public/assets/avatars/complete-pair')/name).read_bytes();jl=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+jl]);start=28+jl
 def values(i,n):
  a=d['accessors'][i];assert a['componentType']==5126
  v=d['bufferViews'][a['bufferView']];offset=start+v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',4*n)
  return [struct.unpack_from('<'+'f'*n,b,offset+k*stride) for k in range(a['count'])]
 node=next(n for n in d['nodes'] if n.get('name')=='PLURR pony strands 0');count=0;error=0
 for prim in d['meshes'][node['mesh']]['primitives']:
  positions=values(prim['attributes']['POSITION'],3);colors=values(prim['attributes']['COLOR_0'],4)
  for point,c in zip(positions,colors):
   expected_color=expected[key(point)];error=max(error,max(abs(a-b) for a,b in zip(c,expected_color)));count+=1
  base=d['materials'][prim['material']]['pbrMetallicRoughness']['baseColorFactor']
  assert max(abs(a-b) for a,b in zip(base,[.6,.02,.16,1]))<1e-7
 assert error<1e-6
 report[name]={'vertexColorsChecked':count,'maximumChannelError':error,'baseFactor':base}
(p/'ends-pass/dye-export-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

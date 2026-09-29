from pathlib import Path
import json,struct
p=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921');d=p/'pony-root-flow-pass'
a=json.loads((d/'before/female-vertex-mapping.json').read_text());b=json.loads((p/'female-vertex-mapping.json').read_text());assert set(a)==set(b)
names=[f'PLURR pony strands {i}' for i in range(3)];native=json.loads((p/'female-native-validation.json').read_text());record={}
float32=lambda v:struct.pack('f'*len(v),*v)
for name in a:
 if name not in names:assert a[name]==b[name],name;continue
 allowed=['after','afterNormals','addedColors'];assert {k:v for k,v in a[name].items() if k not in allowed}=={k:v for k,v in b[name].items() if k not in allowed},name
 roots=native['meshes']['ponyRootFlow']['selectedCardFirstVertices'][name];moving=set();tinted=set()
 for first in roots:
  moving.update(range(first,first+14));tinted.update(range(first+4,first+16))
 fixed=0
 for i,(old,new) in enumerate(zip(a[name]['after'],b[name]['after'])):
  if i not in moving:assert old==new,(name,i);fixed+=1
  # Native colors and glTF accessors are float32; prior authoring JSON may
  # retain extra arithmetic precision that never reached either asset.
  if i not in tinted:assert float32(a[name]['addedColors'][i])==float32(b[name]['addedColors'][i]),(name,i,'color')
 record[name]={'unchangedLowerAndCheekVertices':fixed,'unchangedRootLowerAndCheekColorsFloat32':len(b[name]['after'])-len(tinted)}
(d/'native-export-array-preservation.json').write_text(json.dumps({'unchangedOtherMappingEntries':len(a)-3,'meshes':record},indent=2)+'\n');print(record)

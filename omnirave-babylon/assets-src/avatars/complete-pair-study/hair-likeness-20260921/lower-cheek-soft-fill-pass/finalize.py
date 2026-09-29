from pathlib import Path
import json,shutil,hashlib,gzip
p=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921');d=p/'lower-cheek-soft-fill-pass'
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png');shutil.copy2('/tmp/female-lower-cheek-fill.log',d/'build.log')
m=read(Path('src/player/completeAvatarDownloads.json'));ex=read(p/'female-portable-validation.json');v=read(d/'portable-face-contour-validation.json');nv=read(d/'native-face-contour-validation.json')
s=read(p/'validation-summary.json');state=read(p.parent/'current-state-validation.json')
record={'change':'Added subtle bilateral lower-cheek padding, tapering before the mouth and cheekbones while retaining the rounded outline.','nativeValidation':'lower-cheek-soft-fill-pass/native-face-contour-validation.json','portableValidation':'lower-cheek-soft-fill-pass/portable-face-contour-validation.json','expressionSamples':len(nv['poses']),'maximumRevisionDisplacementMm':nv['maximumRevisionDisplacementMm']}
files=[p/'female-hair-refined.blend',p.parent/'female-runtime.blend',p/'female-native-validation.json',p/'female-portable-validation.json',Path('src/player/completeAvatarDownloads.json'),Path('scripts/launch-body-proof/refine_female_face_contour.py'),Path('scripts/launch-body-proof/apply_female_face_contour.mjs')]
for n in ['female.glb','female-lod1.glb','female-lod2.glb']:
 f=Path('public/assets/avatars/complete-pair')/n
 assert sha(f)==m[n]['sha256']==ex[n]['sha256']
 assert gzip.decompress(Path(str(f)+'.gz').read_bytes())==f.read_bytes()
 assert ex[n]['gltfErrors']==0 and v[n]['unchangedHairOutfitsRigAnimationsWeightsUvsTextures']
 s['exports']['female'][n]=ex[n];s['delivery'][n]={'sha256':m[n]['sha256'],'compressedBytes':m[n]['gzipBytes'],'gltfErrors':0}
 state['checks']['gltfFiles'][n]={'bytes':m[n]['bytes'],'sha256':m[n]['sha256'],'gltfErrors':0};state['checks']['losslessDelivery']['assets'][n]=m[n]
 files += [f,Path(str(f)+'.gz')]
s['nativeFiles']['female-hair-refined.blend']=sha(p/'female-hair-refined.blend');s['femaleLowerCheekSoftFillContinuation']=record
write(p/'validation-summary.json',s);files.append(p/'validation-summary.json')
state['checks']['referenceHair']['femaleLowerCheekSoftFillPass']=record
for f in files:state['files'][str(f)]={'bytes':f.stat().st_size,'sha256':sha(f)}
write(p.parent/'current-state-validation.json',state);write(d/'completion.json',record)
print('Female sources and 3 exports synchronized; zero glTF errors.')

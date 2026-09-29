"""Local-only facial landmark measurements; never uploads reference images."""
from pathlib import Path
import argparse,json,hashlib
import numpy as np
from PIL import Image
import mediapipe as mp

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'omnirave-babylon/assets-src/avatars/astra-male-proof/landmarks'
parser=argparse.ArgumentParser(); parser.add_argument('image');parser.add_argument('name')
parser.add_argument('--crop',nargs=4,type=int)
args=parser.parse_args(); path=Path(args.image).resolve()
im=Image.open(path).convert('RGB');w,h=im.size
box=args.crop or [0,0,w,h]; im=im.crop(box)
scale=768/max(im.size)
data=np.asarray(im.resize((round(im.width*scale),round(im.height*scale))))
options=mp.tasks.vision.FaceLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path=str(ROOT/'.tooling/avatar-landmarks-models/face_landmarker.task'),delegate=mp.tasks.BaseOptions.Delegate.CPU),
    output_face_blendshapes=True,output_facial_transformation_matrixes=True,
    min_face_detection_confidence=.4,min_face_presence_confidence=.4)
with mp.tasks.vision.FaceLandmarker.create_from_options(options) as detector:
    result=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=data))
if len(result.face_landmarks)!=1:raise RuntimeError(f'Expected one face, got {len(result.face_landmarks)}')
points=[[p.x*(box[2]-box[0])+box[0],p.y*(box[3]-box[1])+box[1],p.z*(box[2]-box[0])] for p in result.face_landmarks[0]]
record={'source':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'source_dimensions':[w,h],'crop':box,'landmarks':points,
        'pose_matrix':result.facial_transformation_matrixes[0].tolist(),
        'expression_estimates':{b.category_name:float(b.score) for b in result.face_blendshapes[0]},
        'caution':'Inferred points, especially occluded contours/depth. Not identity acceptance. No reference upload.'}
OUT.mkdir(exist_ok=True,parents=True);(OUT/f'{args.name}-landmarks.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'name':args.name,'landmarks':len(points),'nose':points[1],'chin':points[152],'eyes':[points[33],points[263]]}))

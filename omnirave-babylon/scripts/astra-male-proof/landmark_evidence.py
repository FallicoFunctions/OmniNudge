"""Record fixed-camera landmark residuals; this is not a recognition score."""
import json,hashlib
from pathlib import Path
import numpy as np
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/astra-male-proof'
LM=OUT/'landmarks'
reference=np.array(json.loads((LM/'original.json').read_text())['landmarks'])[:,:2]
ids=[1,4,33,133,263,362,61,291,152,168,197,2,98,327]
rows=[]
for name in ['pose04','fit05']:
    path=LM/f'{name}.json'
    data=json.loads(path.read_text()); points=np.array(data['landmarks'])[:,:2]
    # Same native source crop and camera for both renders, no per-image refit.
    native=points/(896/252)+[405,58]
    residual=native[ids]-reference[ids]
    rows.append({'checkpoint':name,'rmse_per_coordinate_native_pixels':float(np.sqrt(np.mean(residual**2))),
      'landmark_indices':ids,'residual_vectors_native_pixels':residual.tolist(),
      'measurement_sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
record={'meaning':'Selected landmark residual diagnostic only; detector error and image ambiguity apply. No likeness acceptance.',
        'camera_control':'pose04 changes camera only; fit05 changes facial surface with the same camera',
        'points_used_in_fitting':True,'independent_holdout':False,'results':rows,
        'reference_sha256':json.loads((LM/'original.json').read_text())['sha256']}
(LM/'landmark-comparison.json').write_text(json.dumps(record,indent=2)+'\n')
print([(r['checkpoint'],round(r['rmse_per_coordinate_native_pixels'],3)) for r in rows])

import sys,runpy
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
runpy.run_path(str(r/'scripts/launch-body-proof/validate_female_upper_flow.py'))
import validate_reference_hair
validate_reference_hair.run('female',False)
runpy.run_path(str(r/'scripts/launch-body-proof/validate_female_cascade.py'))
runpy.run_path(str(r/'scripts/launch-body-proof/validate_female_upper_clearance.py'))

import sys,runpy
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
runpy.run_path(str(r/'scripts/launch-body-proof/validate_female_temple_plait.py'))
import validate_reference_hair
validate_reference_hair.run('female',False)
runpy.run_path(str(Path(__file__).with_name('render-views.py')))

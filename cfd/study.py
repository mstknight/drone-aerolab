"""Sequential mesh study; do not escalate a failed numerical-quality gate."""
from pathlib import Path
from case import generate
from runner import run
from audit import audit
import json
root=Path(__file__).resolve().parent/'runs'
for level in ('wall-coarse','wall-medium','wall-fine'):
 path=root/('study-'+level)
 if (path/'result.json').exists():
  result=json.loads((path/'result.json').read_text())
 else:
  config=generate(path,speed=20,iterations=1200,mesh=level)
  print(level,config['cells'],flush=True)
  result=run(path,lambda stage:print(level,stage,flush=True))
 evidence=audit(path)
 print(level,result['latest'],result['bodyYPlus'],flush=True)
 if not evidence['fullGeometryPassed'] or not evidence['solverConverged']:
  print('STOP: full mesh quality or residual convergence gate not passed. Resolve before escalating refinement.',flush=True)
  break

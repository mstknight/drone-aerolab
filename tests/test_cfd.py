import sys, tempfile, unittest, json, re
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cfd'))
from case import generate
from runner import coefficients, run

class CaseTests(unittest.TestCase):
 def test_mesh_is_conformal_and_body_closed(self):
  with tempfile.TemporaryDirectory() as d:
   config=generate(d);s=(Path(d)/'system/blockMeshDict').read_text()
   blocks=[list(map(int,m.split())) for m in re.findall(r'hex \(([^)]+)\)',s)]
   self.assertEqual(len(blocks),26)
   face_ids=((0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2),(0,3,2,1),(4,5,6,7))
   faces={}
   for v in blocks:
    for f in face_ids:
     key=tuple(sorted(v[i] for i in f));faces[key]=faces.get(key,0)+1
   self.assertTrue(all(n in (1,2) for n in faces.values()))
   patches=s.split('boundary (')[1].split('mergePatchPairs')[0]
   boundary=[tuple(sorted(map(int,x.split()))) for x in re.findall(r'\((\d+(?: \d+){3})\)',patches)]
   self.assertEqual(len(boundary),len(set(boundary)))
   self.assertEqual(set(boundary),{f for f,n in faces.items() if n==1})
   body=patches.split('body\n')[1]
   bodyfaces=[tuple(map(int,x.split())) for x in re.findall(r'\((\d+(?: \d+){3})\)',body)]
   self.assertEqual(len(bodyfaces),6)
   edges={}
   for face in bodyfaces:
    for a,b in zip(face,face[1:]+face[:1]):
     key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1
   self.assertTrue(all(n==2 for n in edges.values()))
   self.assertEqual(config['referenceAreaM2'],1.2)
   medium=generate(Path(d)/'medium',mesh='medium')
   self.assertEqual(medium['cells'],8*config['cells'])
 def test_invalid_requests(self):
  for kwargs in ({'speed':float('nan')},{'speed':0},{'speed':True},{'mesh':'evil'},{'iterations':100.2},{'iterations':2001}):
   with self.subTest(kwargs=kwargs),tempfile.TemporaryDirectory() as d:
    with self.assertRaises(ValueError):generate(d,**kwargs)
 def test_force_columns_parsed_by_name(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'postProcessing/forceCoeffs/0';path.mkdir(parents=True)
   (path/'coefficient.dat').write_text('# Time Cd Cs Cl CmRoll\n1 0.4 0.02 0.1 0\n2 0.42 0.03 0.11 0\n')
   self.assertEqual(coefficients(Path(d))[-1],{'Time':2,'Cd':.42,'Cl':.11})
 def test_restart_numbered_force_file_is_used(self):
  with tempfile.TemporaryDirectory() as d:
   import os
   path=Path(d)/'postProcessing/forceCoeffs/0';path.mkdir(parents=True)
   old=path/'coefficient.dat';old.write_text('# Time Cd Cl\n17 -1.2 0.2\n');os.utime(old,(1,1))
   (path/'coefficient_0.dat').write_text('# Time Cd Cl\n1200 .95 -.2\n')
   self.assertEqual(coefficients(Path(d))[-1]['Time'],1200)
 def test_shared_solver_lock_prevents_concurrent_run(self):
  import fcntl,runner
  with (Path(runner.__file__).parent/'solver.lock').open('a') as handle:
   fcntl.flock(handle,fcntl.LOCK_EX | fcntl.LOCK_NB)
   with tempfile.TemporaryDirectory() as d,patch('runner.runtime') as runtime:
    with self.assertRaisesRegex(RuntimeError,'已有计算'):run(d,lambda x:None)
    runtime.assert_not_called()
 def test_no_fake_output_without_solver(self):
  with tempfile.TemporaryDirectory() as d,patch('runner.runtime',return_value={'ready':False,'message':'missing'}):
   with self.assertRaisesRegex(RuntimeError,'missing'):run(d,lambda x:None)
   self.assertFalse((Path(d)/'result.json').exists())
 def test_failed_mesh_prevents_solver(self):
  with tempfile.TemporaryDirectory() as d,patch('runner.runtime',return_value={'ready':True,'kind':'native'}),patch('runner.subprocess.run') as process:
   process.return_value.returncode=0
   with self.assertRaisesRegex(RuntimeError,'网格质量'):run(d,lambda x:None)
   self.assertEqual([c.args[0][0] for c in process.call_args_list],['blockMesh','checkMesh'])

if __name__=='__main__':unittest.main()

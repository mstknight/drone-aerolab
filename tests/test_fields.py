import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cfd'))
from fields import export_fields

class FieldTests(unittest.TestCase):
 def test_pressure_units_velocity_magnitude_and_cell_geometry(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);vtk=root/'VTK/case_12';(vtk/'boundary').mkdir(parents=True)
   (root/'aerolab.json').write_text(json.dumps({'densityKgM3':1.225}))
   points='0 -1 0 1 -1 0 1 1 0 0 1 0 0 -1 1 1 -1 1 1 1 1 0 1 1'
   def a(name,values):return f'<DataArray Name="{name}" format="ascii">{values}</DataArray>'
   (vtk/'internal.vtu').write_text('<VTKFile><UnstructuredGrid><Piece><Points>'+a('Points',points)+'</Points><Cells>'+a('connectivity','0 1 2 3 4 5 6 7')+a('offsets','8')+a('types','12')+'</Cells><CellData>'+a('U','3 4 0')+a('p','10')+'</CellData></Piece></UnstructuredGrid></VTKFile>')
   (vtk/'boundary/body.vtp').write_text('<VTKFile><PolyData><Piece><Points>'+a('Points',points)+'</Points><Polys>'+a('connectivity','0 1 2 3')+a('offsets','4')+'</Polys><CellData>'+a('p','-20')+'</CellData></Piece></PolyData></VTKFile>')
   r=export_fields(root)
   self.assertEqual(r['rectangles'],[[0,1,0,1,5,12.25,3,0]])
   self.assertEqual(r['ranges']['surfacePressure'],[-24.5,-24.5])
   self.assertEqual(len(r['surface']),24)
   self.assertEqual(r['time'],12)
 def test_missing_fields_not_synthesized(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'aerolab.json').write_text('{"densityKgM3":1.225}')
   with self.assertRaisesRegex(ValueError,'Missing computed'):export_fields(p)
   self.assertFalse((p/'fields.json').exists())

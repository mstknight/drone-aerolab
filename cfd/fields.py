"""Extract real cell-valued VTK fields; no analytic or synthetic flow."""
from pathlib import Path
import json,xml.etree.ElementTree as ET
import numpy as np

def array(piece,path,name=None,dtype=float):
    nodes=piece.findall(path+'/DataArray')
    node=next((n for n in nodes if name is None or n.get('Name')==name),None)
    if node is None or node.get('format')!='ascii':raise ValueError('Required ASCII VTK array missing: '+str(name))
    return np.fromstring(node.text or '',sep=' ',dtype=dtype)

def export_fields(root):
    root=Path(root);config=json.loads((root/'aerolab.json').read_text());rho=config['densityKgM3']
    files=list(root.glob('VTK/*/internal.vtu'))
    if not files:raise ValueError('Missing computed VTK fields')
    file=max(files,key=lambda p:float(p.parent.name.rsplit('_',1)[-1]));piece=ET.parse(file).find('.//Piece')
    points=array(piece,'Points').reshape(-1,3);types=array(piece,'Cells','types',int);offsets=array(piece,'Cells','offsets',int);indices=array(piece,'Cells','connectivity',int)
    if not np.all(types==12) or not np.all(np.diff(np.r_[0,offsets])==8):raise ValueError('Viewer currently supports structured hexahedral CFD mesh only')
    # Vectorized cell bounds, retained at original resolution; no grid resampling.
    cells=points[indices.reshape(-1,8)];mins=cells.min(axis=1);maxs=cells.max(axis=1)
    mask=(mins[:,1]<=1e-8)&(maxs[:,1]>1e-8)
    u=array(piece,'CellData','U').reshape(-1,3);p=array(piece,'CellData','p')*rho
    if not np.isfinite(u).all() or not np.isfinite(p).all():raise ValueError('Non-finite computed field')
    ids=np.flatnonzero(mask)
    rectangles=np.column_stack([mins[ids,0],maxs[ids,0],mins[ids,2],maxs[ids,2],np.linalg.norm(u[ids],axis=1),p[ids],u[ids,0],u[ids,2]])
    # Exact body faces and boundary cell pressure, triangulated only for rendering.
    body=ET.parse(file.parent/'boundary/body.vtp').find('.//Piece')
    bp=array(body,'Points').reshape(-1,3);bi=array(body,'Polys','connectivity',int);bo=array(body,'Polys','offsets',int);pressure=array(body,'CellData','p')*rho
    y_nodes=body.findall('CellData/DataArray');has_y=any(n.get('Name')=='yPlus' for n in y_nodes)
    yplus=array(body,'CellData','yPlus') if has_y else None
    surface=[];areas=[];start=0
    for i,end in enumerate(bo):
        face=bi[start:end];start=end
        area=0.0
        for j in range(1,len(face)-1):
            area+=float(np.linalg.norm(np.cross(bp[face[j]]-bp[face[0]],bp[face[j+1]]-bp[face[0]])))/2
            for v in (face[0],face[j],face[j+1]):surface.extend([*bp[v],pressure[i]])
        areas.append(area)
    areas=np.array(areas)
    quality=None if yplus is None else {'areaWeightedMean':float(np.average(yplus,weights=areas)),'areaFraction30to300':float(areas[(yplus>=30)&(yplus<=300)].sum()/areas.sum()),'min':float(yplus.min()),'max':float(yplus.max())}
    result={'wallQuality':quality,'source':'OpenFOAM VTK cell fields','time':float(file.parent.name.rsplit('_',1)[-1]),'jobId':root.name,'units':{'velocity':'m/s','pressure':'Pa (relative to outlet)'},'plane':'y = 0 m, positive-side adjacent cell values','interpolation':'none; original cell values, no smoothing','density':rho,'rectColumns':['xmin','xmax','zmin','zmax','speed','pressurePa','Ux','Uz'],'rectangles':rectangles.round(7).tolist(),'surface':np.round(surface,7).tolist(),'ranges':{'speed':[float(rectangles[:,4].min()),float(rectangles[:,4].max())],'pressure':[float(rectangles[:,5].min()),float(rectangles[:,5].max())],'surfacePressure':[float(pressure.min()),float(pressure.max())]},'configuration':config}
    (root/'fields.json').write_text(json.dumps(result,separators=(',',':'),allow_nan=False));return result
if __name__=='__main__':
 import sys
 for p in sys.argv[1:]:
  r=export_fields(p);print(p,len(r['rectangles']),'slice cells',r['ranges'])

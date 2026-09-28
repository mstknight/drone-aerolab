"""OpenCFD OpenFOAM v2412: stationary cuboid external-flow pipeline baseline.
Not a validated vehicle aerodynamic model. Axes: x flow, y lateral, z up.
"""
from pathlib import Path
import json
import math

IMAGE = 'opencfd/openfoam-default:2412'

def header(name, cls='dictionary'):
    return f'FoamFile\n{{ version 2.0; format ascii; class {cls}; object {name}; }}\n'

def generate(root, speed=20.0, iterations=600, mesh='coarse'):
    if isinstance(speed,bool) or not isinstance(speed,(int,float)) or not math.isfinite(speed) or not 1 <= speed <= 40:
        raise ValueError('speed must be 1–40 m/s')
    if type(iterations) is not int or not 100 <= iterations <= 2000:
        raise ValueError('iterations must be 100–2000')
    if mesh not in ('coarse','medium','wall-coarse','wall-medium','wall-fine'):
        raise ValueError('mesh must be coarse or medium')
    root = Path(root)
    for folder in ('0','constant','system'): (root/folder).mkdir(parents=True,exist_ok=True)
    def write(path, name, body, cls='dictionary'):
        (root/path).write_text(header(name,cls)+body)
    # Conformal multi-block mesh; remove the central body block.
    axes=[[-9,-1.5,1.5,18],[-6,-.6,.6,6],[0,.15,1.15,6]]
    counts=[[15,12,33],[12,8,12],[3,8,16]]
    if mesh=='medium': counts=[[n*2 for n in row] for row in counts]
    grading=[['1']*3 for _ in range(3)]
    if mesh.startswith('wall-'):
        factor={'wall-coarse':1,'wall-medium':1.3,'wall-fine':1.6}[mesh]
        counts=[[round(n*factor) for n in row] for row in [[24,20,32],[24,12,24],[12,16,28]]]
        grading=[['0.01','((0.5 0.5 5)(0.5 0.5 0.2))','200'],['0.01','((0.5 0.5 5)(0.5 0.5 0.2))','100'],['((0.5 0.5 8)(0.5 0.5 0.125))','((0.5 0.5 5)(0.5 0.5 0.2))','100']]

    verts=[(x,y,z) for z in axes[2] for y in axes[1] for x in axes[0]]
    def vid(i,j,k): return k*16+j*4+i
    blocks=[]; boundary={n:[] for n in ['inlet','outlet','sides','top','ground','body']}
    cells=0
    face_defs=[((-1,0,0),(0,4,7,3)),((1,0,0),(1,2,6,5)),((0,-1,0),(0,1,5,4)),((0,1,0),(3,7,6,2)),((0,0,-1),(0,3,2,1)),((0,0,1),(4,5,6,7))]
    for k in range(3):
      for j in range(3):
       for i in range(3):
        if (i,j,k)==(1,1,1): continue
        v=[vid(i,j,k),vid(i+1,j,k),vid(i+1,j+1,k),vid(i,j+1,k),vid(i,j,k+1),vid(i+1,j,k+1),vid(i+1,j+1,k+1),vid(i,j+1,k+1)]
        n=[counts[0][i],counts[1][j],counts[2][k]]; cells+=math.prod(n)
        blocks.append(f'hex ({" ".join(map(str,v))}) ({" ".join(map(str,n))}) simpleGrading ({grading[0][i]} {grading[1][j]} {grading[2][k]})')
        for (di,dj,dk),f in face_defs:
            nb=(i+di,j+dj,k+dk)
            name=None
            if nb==(1,1,1): name='body'
            elif nb[0]<0: name='inlet'
            elif nb[0]>2: name='outlet'
            elif nb[1]<0 or nb[1]>2: name='sides'
            elif nb[2]<0: name='ground'
            elif nb[2]>2: name='top'
            if name: boundary[name].append(tuple(v[x] for x in f))
    patches=[]
    for name, faces in boundary.items():
        typ='wall' if name in ('ground','body') else 'symmetryPlane' if name in ('top','sides') else 'patch'
        # Two opposite side patches cannot form a single symmetryPlane.
        if name=='sides': typ='symmetry'
        patches.append(f'{name}\n{{ type {typ}; faces (\n'+''.join('('+ ' '.join(map(str,f))+')\n' for f in faces)+'); }')
    write('system/blockMeshDict','blockMeshDict','convertToMeters 1;\nvertices (\n'+''.join('('+ ' '.join(map(str,v))+')\n' for v in verts)+');\nblocks (\n'+'\n'.join(blocks)+');\nedges ();\nboundary (\n'+'\n'.join(patches)+');\nmergePatchPairs ();\n')
    write('system/decomposeParDict','decomposeParDict','numberOfSubdomains 4;\nmethod scotch;\n')
    intensity=.01; k=1.5*(speed*intensity)**2; omega=math.sqrt(k)/(.09**.25*.07)
    def field(name,cls,dims,internal,inlet,outlet,ground,body):
        write('0/'+name,name,f'dimensions [{dims}];\ninternalField uniform {internal};\nboundaryField\n{{\ninlet {{ {inlet} }}\noutlet {{ {outlet} }}\nsides {{ type symmetry; }}\ntop {{ type symmetryPlane; }}\nground {{ {ground} }}\nbody {{ {body} }}\n}}\n',cls)
    velocity=f'({speed} 0 0)'
    field('U','volVectorField','0 1 -1 0 0 0 0',velocity,f'type fixedValue; value uniform {velocity};','type inletOutlet; inletValue uniform (0 0 0); value uniform (0 0 0);','type noSlip;','type noSlip;')
    field('p','volScalarField','0 2 -2 0 0 0 0','0','type zeroGradient;','type fixedValue; value uniform 0;','type zeroGradient;','type zeroGradient;')
    field('k','volScalarField','0 2 -2 0 0 0 0',str(k),f'type fixedValue; value uniform {k};',f'type inletOutlet; inletValue uniform {k}; value uniform {k};',f'type kqRWallFunction; value uniform {k};',f'type kqRWallFunction; value uniform {k};')
    field('omega','volScalarField','0 0 -1 0 0 0 0',str(omega),f'type fixedValue; value uniform {omega};',f'type inletOutlet; inletValue uniform {omega}; value uniform {omega};',f'type omegaWallFunction; value uniform {omega};',f'type omegaWallFunction; value uniform {omega};')
    field('nut','volScalarField','0 2 -1 0 0 0 0','0','type calculated; value uniform 0;','type calculated; value uniform 0;','type nutkWallFunction; value uniform 0;','type nutkWallFunction; value uniform 0;')
    write('constant/transportProperties','transportProperties','transportModel Newtonian;\nnu [0 2 -1 0 0 0 0] 1.5e-05;\n')
    write('constant/turbulenceProperties','turbulenceProperties','simulationType RAS;\nRAS { RASModel kOmegaSST; turbulence on; printCoeffs on; }\n')
    write('system/fvSchemes','fvSchemes','''ddtSchemes { default steadyState; }
gradSchemes { default cellLimited Gauss linear 1; }
divSchemes { default none; div(phi,U) bounded Gauss upwind; div(phi,k) bounded Gauss upwind; div(phi,omega) bounded Gauss upwind; div((nuEff*dev2(T(grad(U))))) Gauss linear; }
laplacianSchemes { default Gauss linear corrected; }
interpolationSchemes { default linear; }
snGradSchemes { default corrected; }
wallDist { method meshWave; }
''')
    write('system/fvSolution','fvSolution','''solvers {
 p { solver GAMG; tolerance 1e-7; relTol 0.05; smoother GaussSeidel; }
 "(U|k|omega)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.05; }
}
SIMPLE { nNonOrthogonalCorrectors 0; consistent yes; residualControl { p 1e-5; U 1e-6; k 1e-6; omega 1e-6; } }
relaxationFactors { fields { p 0.3; } equations { U 0.7; k 0.7; omega 0.7; } }
''')
    write('system/controlDict','controlDict',f'''application simpleFoam;
startFrom startTime; startTime 0; stopAt endTime; endTime {iterations}; deltaT 1;
writeControl timeStep; writeInterval 100; purgeWrite 2; writeFormat ascii; writePrecision 9;
runTimeModifiable false;
functions {{
 forceCoeffs {{ type forceCoeffs; libs ("libforces.so"); patches (body); p p; U U;
 rho rhoInf; rhoInf 1.225; magUInf {speed}; lRef 3; Aref 1.2;
 CofR (0 0 0.65); dragDir (1 0 0); liftDir (0 0 1); pitchAxis (0 1 0);
 writeControl timeStep; writeInterval 1; log yes;
 }}
 yPlus {{ type yPlus; libs ("libfieldFunctionObjects.so"); writeControl writeTime; }}
}}
''')
    config={'case':'cuboid-baseline','solver':'simpleFoam','distribution':'OpenCFD v2412','speedMs':speed,'iterations':iterations,'mesh':mesh,'meshFamily':'graded-wall-v1' if mesh.startswith('wall-') else 'uniform-v1','cells':cells,'bodyDimensionsM':[3,1.2,1],'groundClearanceM':.15,'referenceAreaM2':1.2,'densityKgM3':1.225,'nuM2S':1.5e-5,'turbulenceIntensity':intensity,'turbulenceLengthM':.07,'ground':'stationary no-slip','yawDeg':0,'validated':False,'limitations':['Coarse pipeline baseline, not a validated car model','First-order upwind; numerical diffusion expected','No mesh independence or experimental validation','Inspect yPlus and force stability before interpretation']}
    (root/'aerolab.json').write_text(json.dumps(config,indent=2)); (root/'case.foam').touch()
    return config

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--speed',type=float,default=20);p.add_argument('--iterations',type=int,default=600);p.add_argument('--mesh',choices=['coarse','medium','wall-coarse','wall-medium','wall-fine'],default='coarse');a=p.parse_args()
    print(json.dumps(generate(a.output,a.speed,a.iterations,a.mesh),indent=2))

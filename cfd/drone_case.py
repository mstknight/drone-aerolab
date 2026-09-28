"""Generate the separate drone CFD baseline case.
This first case is a fixed-pose body-only external-flow case. It is intentionally
separate from the historical cuboid vehicle case and does not model transient
rotors, actuator discs, or gusts. Results must be used to calibrate the browser
model only after mesh and experimental checks pass.
"""
from pathlib import Path
import argparse, json, math

def generate(root, speed=8.0, iterations=400, mesh='coarse'):
    if not isinstance(speed,(int,float)) or not 1<=speed<=25: raise ValueError('speed must be 1–25 m/s')
    if not isinstance(iterations,int) or not 100<=iterations<=2000: raise ValueError('iterations must be 100–2000')
    root=Path(root); [ (root/x).mkdir(parents=True,exist_ok=True) for x in ('0','constant','system') ]
    # The body is a 0.70 m diagonal-frame proxy; this is not a detailed rotor geometry.
    nx,ny,nz=(36,24,24) if mesh=='medium' else (24,16,16)
    def h(name,body,cls='dictionary'):
      (root/name).write_text(f'FoamFile {{ version 2.0; format ascii; class {cls}; object {Path(name).name}; }}\n'+body)
    h('system/blockMeshDict',f'''convertToMeters 1;
vertices ( (-4 -3 0) (6 -3 0) (6 3 0) (-4 3 0) (-4 -3 6) (6 -3 6) (6 3 6) (-4 3 6) );
blocks ( hex (0 1 2 3 4 5 6 7) ({nx} {ny} {nz}) simpleGrading (1 1 1) ); edges (); boundary ( inlet {{ type patch; faces ((0 4 7 3)); }} outlet {{ type patch; faces ((1 2 6 5)); }} sides {{ type symmetry; faces ((0 1 5 4) (3 7 6 2)); }} ground {{ type symmetryPlane; faces ((0 3 2 1)); }} top {{ type symmetryPlane; faces ((4 5 6 7)); }} body {{ type wall; faces ((0 1 2 3)); }} ); mergePatchPairs ();\n''')
    h('system/controlDict',f'''application simpleFoam; startFrom startTime; startTime 0; stopAt endTime; endTime {iterations}; deltaT 1; writeControl timeStep; writeInterval 100; writeFormat ascii; writePrecision 9; runTimeModifiable false;\n''')
    h('system/fvSchemes','ddtSchemes { default steadyState; }\ngradSchemes { default Gauss linear; }\ndivSchemes { default none; div(phi,U) bounded Gauss upwind; }\nlaplacianSchemes { default Gauss linear corrected; }\ninterpolationSchemes { default linear; }\nsnGradSchemes { default corrected; }\n')
    h('system/fvSolution','solvers { p { solver GAMG; tolerance 1e-7; relTol 0.05; } U { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.05; } } SIMPLE { nNonOrthogonalCorrectors 0; }\n')
    h('constant/transportProperties','transportModel Newtonian;\nnu [0 2 -1 0 0 0 0] 1.5e-05;\n')
    h('constant/turbulenceProperties','simulationType RAS;\nRAS { RASModel kOmegaSST; turbulence on; printCoeffs on; }\n')
    def field(name,cls,dims,internal,body): h('0/'+name,f'dimensions [{dims}];\ninternalField uniform {internal};\nboundaryField {{ inlet {{ type fixedValue; value uniform {body}; }} outlet {{ type zeroGradient; }} sides {{ type symmetry; }} ground {{ type symmetryPlane; }} top {{ type symmetryPlane; }} body {{ type noSlip; }} }}\n',cls)
    field('U','volVectorField','0 1 -1 0 0 0 0',f'({speed} 0 0)',f'({speed} 0 0)');field('p','volScalarField','0 2 -2 0 0 0 0','0','0')
    config={'case':'drone-fixed-pose-proxy','solver':'simpleFoam','speedMs':speed,'iterations':iterations,'mesh':mesh,'cells':nx*ny*nz,'body':'X-quadrotor diagonal-frame proxy','bodySizeM':.70,'rotors':False,'gust':False,'validated':False,'limitations':['body-only proxy, not detailed rotor geometry','steady RANS; no transient gust or actuator-disc model','must pass mesh, convergence and experimental checks before calibration']}
    (root/'aerolab.json').write_text(json.dumps(config,indent=2));(root/'case.foam').touch();return config
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--speed',type=float,default=8);p.add_argument('--iterations',type=int,default=400);p.add_argument('--mesh',choices=['coarse','medium'],default='coarse');p.add_argument('--run',action='store_true');a=p.parse_args();print(json.dumps(generate(a.output,a.speed,a.iterations,a.mesh),indent=2));
 if a.run: print('生成完成；请使用无人机专属 runner 通过 OpenFOAM 检查后再求解。')

"""Local trusted OpenFOAM runner. Never substitutes synthetic CFD results."""
from pathlib import Path
import json, math, re, shutil, subprocess, zipfile
from case import IMAGE

def docker_binary():
    return shutil.which("docker") or next((str(p) for p in (Path.home()/".docker/bin/docker",Path("/Applications/Docker.app/Contents/Resources/bin/docker")) if p.is_file()), None)

def runtime():
    required=('blockMesh','checkMesh','simpleFoam','foamToVTK')
    if all(shutil.which(x) for x in required): return {'ready':True,'kind':'native','message':'本机 OpenFOAM 环境已加载（需 OpenCFD v2412）'}
    if docker_binary():
        try:
            p=subprocess.run([docker_binary(),'image','inspect',IMAGE],capture_output=True,timeout=10)
            if p.returncode==0:return {'ready':True,'kind':'docker','message':IMAGE+' 已就绪'}
        except (subprocess.TimeoutExpired,OSError):pass
        return {'ready':False,'kind':'docker','message':'Docker 服务或 OpenFOAM 镜像未就绪。请启动 Docker 并拉取 '+IMAGE}
    return {'ready':False,'kind':'missing','message':'尚未安装 OpenFOAM / Docker。案例可以生成，但不能开始求解。'}

def command(tool, root, kind, parallel=False):
    args=[tool]+(['-allTopology'] if tool=='checkMesh' else ['-latestTime','-ascii'] if tool=='foamToVTK' else [])
    if tool=='simpleFoam' and parallel:args=['mpirun','--allow-run-as-root','-np','4','simpleFoam','-parallel']
    if tool=='reconstructPar':args+=['-latestTime']
    if kind=='native':return args
    # Fixed trusted commands; no user-provided shell text.
    script='source /usr/lib/openfoam/openfoam2412/etc/bashrc && exec '+' '.join(args)
    return [docker_binary(),'run','--rm','--network=none','--cpus=4','--memory=8g','--entrypoint','/bin/bash','-v',str(root.resolve())+':/case','-w','/case',IMAGE,'-lc',script]

def coefficients(root):
    files=list(root.glob('postProcessing/forceCoeffs/**/coefficient*.dat'))
    if not files:return []
    columns=[];rows=[]
    for line in max(files,key=lambda p:p.stat().st_mtime).read_text().splitlines():
        stripped=line.lstrip('# ').strip()
        if stripped.startswith('Time') and 'Cd' in stripped.split():columns=stripped.split();continue
        if line.startswith('#') or not line.strip():continue
        if columns:
            values=line.split()
            if len(values)!=len(columns):continue
            try:row={key:float(value) for key,value in zip(columns,values)}
            except ValueError:continue
            if not all(math.isfinite(v) for v in row.values()):raise ValueError('Non-finite force coefficients')
            rows.append({k:row[k] for k in ('Time','Cd','Cl') if k in row})
    return rows

def run(root, report):
    # Shared across API and CLI processes; released automatically on exit.
    import fcntl
    with (Path(__file__).resolve().parent/'solver.lock').open('a') as handle:
        try:fcntl.flock(handle,fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('已有计算正在运行，请等待完成')
        return _run(root, report)

def wall_warning(quality):
    if quality is None:return '缺少面积加权 y+ 数据，近壁分辨率尚未评估。'
    fraction=quality['areaFraction30to300']
    if fraction < .95:return '部分近壁区域未达到参考范围：需结合局部 y+ 检查网格；当前结果未通过工程验证。'
    if fraction < 1:return '局部 y+ 超出 30–300 参考范围；大部分表面积已在范围内，仍需检查局部分辨率。'
    return None

def pack_results(root):
    root=Path(root)
    with zipfile.ZipFile(root/'results.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for p in root.rglob('*'):
            if p.is_file() and (p.suffix in ('.vtk','.vtp','.vtu','.vtm','.series') or p.name in ('result.json','fields.json','audit.json','aerolab.json','case.foam') or p.name.startswith('log.') or (p.suffix=='.dat' and 'postProcessing' in p.parts)):archive.write(p,p.relative_to(root))

def _run(root, report):
    root=Path(root); env=runtime()
    if not env['ready']:raise RuntimeError(env['message'])
    config=json.loads((root/'aerolab.json').read_text()) if (root/'aerolab.json').exists() else {}
    parallel=config.get('cells',0)>300000 and env['kind']=='docker'
    steps=['blockMesh','checkMesh']+(['decomposePar'] if parallel else [])+['simpleFoam']+(['reconstructPar'] if parallel else [])+['foamToVTK']
    for tool in steps:
        report(tool)
        with (root/('log.'+tool)).open('w') as stream:
            process=subprocess.run(command(tool,root,env['kind'],parallel),cwd=root,stdout=stream,stderr=subprocess.STDOUT,timeout=7200)
        log=(root/('log.'+tool)).read_text(errors='replace')
        if process.returncode or 'FOAM FATAL' in log:raise RuntimeError(tool+' 失败，请检查日志')
        if tool=='checkMesh' and 'Mesh OK.' not in log:raise RuntimeError('网格质量检查未通过，停止计算')
        if tool=='simpleFoam' and not re.search(r'^End\s*$',log,re.M):raise RuntimeError('求解器未正常结束')
    full_mesh_check(root,env['kind'])
    return collect_results(root,report)

def full_mesh_check(root, kind):
    root=Path(root)
    args=command('checkMesh',root,kind)
    if kind=='native':args.append('-allGeometry')
    else:args[-1]+=' -allGeometry'
    with (root/'log.checkMeshFull').open('w') as stream:
        subprocess.run(args,cwd=root,stdout=stream,stderr=subprocess.STDOUT,timeout=300)
    # Keep diagnostic results, but audit reports extra-check failures explicitly.

def collect_results(root, report=lambda stage:None):
    root=Path(root)
    if not re.search(r'^End\s*$',(root/'log.simpleFoam').read_text(),re.M):
        raise RuntimeError('求解器未正常结束，不能生成完成结果')
    from fields import export_fields
    report('exportFields');field_data=export_fields(root)
    rows=coefficients(root)
    if not rows:raise RuntimeError('没有可读取的 forceCoeffs 结果')
    if rows[-1]['Time'] != field_data['time']:raise RuntimeError('力系数和场数据迭代步不一致，拒绝混合结果')
    log=(root/'log.simpleFoam').read_text(errors='replace')
    residuals={}
    for name,value in re.findall(r'Solving for (\w+), Initial residual = ([\deE.+-]+)',log):
        residuals[name]=float(value)
    if not all(math.isfinite(v) for v in residuals.values()):raise RuntimeError('Non-finite residuals')
    converged=bool(re.search(r'SIMPLE solution converged',log))
    latest=rows[-1]; recent=rows[-50:];cd=[x['Cd'] for x in recent if 'Cd' in x]
    variation=(max(cd)-min(cd))/max(abs(sum(cd)/len(cd)),1e-9) if cd else None
    wall_matches=re.findall(r'patch body y\+ : min = ([\deE.+-]+), max = ([\deE.+-]+), average = ([\deE.+-]+)',log)
    body_yplus=dict(zip(('min','max','average'),map(float,wall_matches[-1]))) if wall_matches else None
    result={'wallQuality':field_data.get('wallQuality'),'bodyYPlus':body_yplus,'wallResolutionWarning':wall_warning(field_data.get('wallQuality')),'source':'OpenFOAM computed','validated':False,'converged':converged,'residuals':residuals,'coefficients':rows,'latest':latest,'last50CdRelativeRange':variation,'configuration':json.loads((root/'aerolab.json').read_text()),'warning':'计算结果未经过网格无关性和实验验证；不得作为实车性能结论。'}
    (root/'result.json').write_text(json.dumps(result,indent=2,allow_nan=False))
    from audit import audit
    result['audit']=audit(root)
    (root/'result.json').write_text(json.dumps(result,indent=2,allow_nan=False))
    (root/'audit.json').write_text(json.dumps(result['audit'],indent=2,allow_nan=False))
    pack_results(root)
    report('complete');return result

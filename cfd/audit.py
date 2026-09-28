"""Evidence audit. Heuristic gates are not experimental validation."""
from pathlib import Path
import json,re

def audit(root):
 root=Path(root);result=json.loads((root/'result.json').read_text());log=(root/'log.simpleFoam').read_text();mesh=(root/'log.checkMesh').read_text()
 mass=re.findall(r'continuity errors : sum local = ([\deE.+-]+), global = ([\deE.+-]+), cumulative = ([\deE.+-]+)',log)
 full=(root/'log.checkMeshFull').read_text() if (root/'log.checkMeshFull').exists() else (mesh if '-allGeometry' in mesh else '')
 q=result.get('wallQuality')
 force=result.get('last50CdRelativeRange')
 return {'jobId':root.name,'fullGeometryPassed':('Mesh OK.' in full) if full else None,'smallDeterminantCells':int(re.findall(r'Cells with small determinant.*number of cells: (\d+)',full)[-1]) if 'Cells with small determinant' in full else 0 if full else None,'meshPassed':'Mesh OK.' in mesh,'aspectRatio':float(re.findall(r'Max aspect ratio\s*[:=]\s*([\deE.+-]+)',mesh)[-1]),'continuityLast':dict(zip(('local','global','cumulative'),map(float,mass[-1]))) if mass else None,'residuals':result['residuals'],'solverConverged':result['converged'],'forceStableHeuristic':force is not None and force<.01,'wallAreaTargetHeuristic':q is not None and q['areaFraction30to300']>=.95,'thresholds':{'CdLast50RelativeRange':.01,'wallAreaFractionWithin30to300':.95},'validated':False}

def report(runs):
 rows=[]
 for root in sorted(Path(runs).iterdir()):
  if (root/'result.json').exists():
   j=json.loads((root/'result.json').read_text());a=audit(root);(root/'audit.json').write_text(json.dumps(a,indent=2));rows.append((root.name,j,a))
 text=['# 网格加密与真实流场验证记录','','所有结果均对应长方体，不是 BMW。下面的门槛是诊断性检查，不是实验验证。','','| 案例 | 单元数 | Cd | 残差收敛 | 平均 y+（求解日志） | 面积比例 y+ 30–300 |','|---|---:|---:|---|---:|---:|']
 for name,j,a in rows:
  q=j.get('wallQuality');text.append(f"| {name} | {j['configuration']['cells']} | {j['latest']['Cd']:.6f} | {'是' if j['converged'] else '否'} | {j['bodyYPlus']['average']:.2f} | {q['areaFraction30to300']*100:.2f}% |" if q else f'| {name} | 待补充面积统计 |')
 graded=sorted([j for _,j,_ in rows if j['configuration'].get('meshFamily')=='graded-wall-v1'],key=lambda j:j['configuration']['cells'])
 text+=['','## 完整几何检查','']
 for name,j,a in rows:
  text.append(f"- {name}：完整几何检查 {'通过' if a['fullGeometryPassed'] else '未通过' if a['fullGeometryPassed'] is False else '未记录'}；小 determinant 单元数 {a['smallDeterminantCells']}。")
 text+=['','三级近壁网格配置已提供，但本轮不继续自动求解：已运行的加密网格存在完整几何检查失败，需先修正质量问题。','','## 网格敏感性','']
 for a,b in zip(graded,graded[1:]):
  delta=abs(b['latest']['Cd']-a['latest']['Cd'])/abs(b['latest']['Cd'])*100
  text.append(f"- {a['configuration']['mesh']} → {b['configuration']['mesh']}：Cd 相对差 {delta:.3f}%。")
 text+=['','由于加密网格的完整几何检查和残差收敛存在未通过项，上述差异只作敏感性观察，不据此宣称网格无关性，不计算形式上的 GCI。仍使用一阶迎风和稳态 RANS，未进行二阶离散敏感性、域尺寸敏感性或公开实验对照。','','## 网格检查说明','','原均匀网格曾使用 checkMesh -allTopology -allGeometry。加密网格采用 checkMesh -allTopology，保留标准几何检查（体积、非正交、纵横比、偏斜等）。此前加密尝试在全几何 determinant 检查中出现失败项。补充完整几何检查的实际结果列于上方。当前标准检查通过不等于全几何检查通过；各向异性可能影响该指标，但尚未独立验证其原因，不能据此忽略潜在网格质量问题。两种检查范围不同。首个过激加密方案最大纵横比约 3276，被拒绝；最终方案降低远近场尺寸比并改善跨块过渡。','','## 网页流场','','从导出的 ASCII VTK 读取原始单元 U 和 p；p 乘 1.225 kg/m³ 转成相对压力 Pa。截面是 y=0 所穿过单元的值，不做插值平滑；车体表面直接读取 boundary/body.vtp。压力颜色不代表精度通过。','','## 后续精度门槛','','改进压力收敛与质量守恒、使用经过验证的离散和湍流设置、近壁网格细化与多网格稳定性检查，最后对照条件一致的公开实验。']
 Path('docs/网格加密验证记录.md').write_text('\n'.join(text)+'\n')
 return rows
if __name__=='__main__':report(Path(__file__).resolve().parent/'runs')

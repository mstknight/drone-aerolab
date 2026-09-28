# CFD 工作流

本目录保留历史车辆长方体 OpenFOAM 流程，并新增独立的 `drone_case.py` 无人机固定姿态 body-only 代理案例。无人机案例用于后续气动力校准，不会被浏览器实时逐帧求解。

```sh
npm run cfd:drone
python3 cfd/drone_case.py /tmp/drone-case --speed 8 --iterations 400 --mesh coarse
```

无人机案例当前不包含详细旋翼、执行器盘、瞬态阵风或实验标定；必须先完成网格质量、残差/载荷稳定和实验对照。历史案例的运行、下载和验证说明保留在 Git 历史中。
# CFD 工作流：实现状态与运行方法

## 当前状态

已接通真实 OpenFOAM 求解、近壁分级网格、四核并行、本地 API 和网页场渲染。
网页支持 y=0 中心截面速度、相对压力以及物体表面压力，保留原始单元数值，箭头读取计算所得 U。
已完成近壁网格的实测数值和收敛状态见 [验证记录](../docs/网格加密验证记录.md)。
当前结果全部属于简化长方体，不是 BMW；尚未通过网格无关性和实验验证。

本机使用 Docker Desktop 4.92.0 和原生 Linux ARM64 的 `opencfd/openfoam-default:2412`。
镜像摘要：`sha256:1ba02114b1c025c370f2e269a07677c16c9bea8d990fcd75ac8378aff9d41b50`。
初始均匀粗网格 51,072 单元，第 155 步残差收敛，但面积加权近壁 y+ 严重偏高。

## 首个案例

一个封闭、平底长方体，不是 Ahmed 标准体，也不是 BMW。

- 长 3 m × 宽 1.2 m × 高 1 m，离地 0.15 m；x 来流、y 横向、z 竖直。
- 域 x ∈ [-9,18]、y ∈ [-6,6]、z ∈ [0,6] m。
- 26 块共形六面体网格。均匀中网格每方向翻倍（8 倍单元）；wall-coarse/medium/fine 对物体及地面采用渐变六面体加密，不是任意实车贴体棱柱层。
- OpenCFD OpenFOAM v2412、simpleFoam、稳态不可压缩 RANS、kOmegaSST。
- 入口 20 m/s（可设 1–40），运动粘度 1.5e-5 m²/s，密度 1.225 kg/m³。
- 湍流强度 1%，长度尺度 0.07 m；k=1.5(UI)²，omega=sqrt(k)/(Cmu^0.25 L)。
- 入口定速度、出口定运动学压力 p=0、地面与车体无滑移、侧面及顶部对称边界。
- 静止地面、零偏航，无车轮；基准面积 1.2 m²、长度 3 m。
- 对流采用一阶迎风以优先跑通流程，会产生数值耗散；本案例不得用于实车阻力结论。

## 准备和启动

本机 Docker Desktop 与镜像已经安装。以后重启电脑时先启动 Docker Desktop。也可在有 OpenCFD v2412 的 Linux 上运行本项目。

```sh
docker pull opencfd/openfoam-default:2412
python3 -m pip install -r cfd/requirements.txt
npm run cfd:case
npm run cfd:serve
# 另一个终端
npm run dev -- --port 5174
```

已实测镜像为 Linux ARM64，无需 x86 仿真；容器内 bashrc 路径 `/usr/lib/openfoam/openfoam2412/etc/bashrc` 已验证。

网页进入“CFD 计算”，检测环境后提交任务。计算服务仅监听 127.0.0.1:8008，Vite 代理 /api/cfd。API 和 CLI 使用共享进程锁限制同时求解；Docker 下超过 30 万单元自动使用 4 个 MPI 进程，其余串行。容器最多 4 CPU、8 GB 内存、禁用网络；每步超时 2 小时。无取消接口，运行期不要关闭服务。文件保留于 cfd/runs/<id>。服务启动时恢复已有 result.json 的已完成任务，网页默认显示最新任务。未完成/失败任务暂不跨重启恢复。

在 Linux 已加载 OpenFOAM v2412 的 shell 中，可直接运行 API，不需要 Docker。本工具没有处理不同 OpenFOAM 发行版的字典差异。

也可直接调用 Python：

```sh
python3 cfd/case.py cfd/cases/cuboid --speed 20 --iterations 600 --mesh coarse
PYTHONPATH=cfd python3 -c 'from runner import run; run("cfd/cases/cuboid",print)'
```

## 实际计算顺序

blockMesh → checkMesh -allTopology →（大网格 decomposePar）→ simpleFoam →（并行场 reconstructPar）→ foamToVTK -latestTime -ascii → 完整几何诊断 → fields.json → audit.json → results.zip。
标准检查必须明确报告 Mesh OK.；失败停止。补充 -allGeometry 的完整几何诊断并独立记录其结果；标准检查通过而完整检查失败的场数据只能作为诊断结果，网页明确警告。详见验证记录。求解器需正常结束且产生有限力系数。正常结束、残差收敛和工程验证分别标注。

压缩包包含 VTK、原始日志、参数、result.json、fields.json、audit.json。
VTK 中 p 是运动学压力，网页已乘密度 1.225 转为 Pa，零点为出口压力。中心截面取 y=0 正侧相邻单元值；不做插值平滑。面积加权 y+ 参考范围 30–300 只是壁函数诊断，不代表精度认证。

```sh
# 分级网格，20 m/s，最多 1200 步；读取已有结果，质量/收敛未达标则停止升级
python3 cfd/study.py
# 汇总保存的实测结果和审计
python3 cfd/audit.py
```

## 信任门槛与后续工作

1. 实际运行并修复运行时版本/字典问题，检查网格质量和质量守恒。
2. 检查残差下降和 Cd/Cl 稳定性；迭代到上限不表示收敛。
3. 检查 wall-function yPlus 的适用性。当前简单网格不保证墙面分辨率。
4. 改进边界层网格、二阶离散，进行至少三套网格的无关性分析及域尺寸敏感性分析。
5. 引入几何和实验条件一致的公开基准（如 Ahmed body），完成实验验证。
6. BMW 网格需单独检查封闭性、尺寸、非流体内部零件等，再生成贴体网格；现有 GLB 仅用于展示。
7. 补充任务取消与未完成任务跨重启恢复。

完成以上验证前，结果只能标注为“未验证计算”，不能声称可信工程预测。

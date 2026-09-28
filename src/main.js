import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';

const app = document.querySelector('#lab-host');
app.innerHTML = `
<header><a class="brand" href="./"><span class="brand-icon">≋</span> AERO<span>LAB</span><small>车辆风洞实验室</small></a><div class="header-right"><span class="status-dot"></span> 实时交互环境 <span class="version">DEMO / 01</span></div></header>
<main><section class="workspace"><div class="section-top"><div><div class="eyebrow">VIRTUAL WIND TUNNEL</div><h1>让气流，变得可见<span>。</span></h1><p>探索车身与空气之间的关系。</p></div><span class="pill">交互演示模式</span></div>
<div class="viewport" id="viewport"><div class="scene-heading"><span class="live-dot"></span><span id="scene-status">气流运行中</span><span class="scene-separator">/</span><span>测试段 01</span></div><div class="orientation">X <span>→</span> 主流方向</div><div class="scene-bottom"><span>拖动旋转 · 滚轮缩放 · 右键平移</span><button id="reset-view" class="text-button">↺ 重置视角</button></div><div class="flow-legend"><span></span> 来流 <i></i> 绕流 <b></b> 尾流示意</div><div class="view-controls"><button data-view="perspective" class="selected">透视</button><button data-view="side">侧视</button><button data-view="top">俯视</button><button data-view="front">迎风</button></div></div>
<div class="metrics"><div><span>入口风速</span><strong id="metric-speed">80<small>km/h</small></strong><div class="metric-line"></div><p>可调节的演示来流</p></div><div><span>偏航角</span><strong id="metric-yaw">0<small>°</small></strong><div class="metric-line"></div><p>来流相对车身的角度</p></div><div><span>气流状态</span><strong id="metric-state" class="word-metric">运行中</strong><div class="metric-line"></div><p>示意流线 · 非 CFD 计算</p></div></div>
</section><aside><div class="panel-title"><div><span class="eyebrow">EXPERIMENT SETUP</span><h2>实验控制台</h2></div><span class="panel-icon">⌘</span></div>
<section class="control-section"><div class="control-label"><h3><span>01</span> 测试车辆</h3><span class="tiny-label">MODEL LIBRARY</span></div><div class="vehicle-card"><span class="car-symbol">▰</span><div><strong id="vehicle-name">Aero GT</strong><p id="vehicle-description">概念运动轿跑 · 简化模型</p></div><span class="check">✓</span></div><label class="model-label" for="model-select">测试模型</label><select id="model-select"><option value="bmw" selected>BMW M4 · 开放许可模型</option><option value="aero">Aero GT · 简化参考车</option></select><div class="model-actions"><button id="import-model">＋ 导入 GLB</button><button id="rotate-model" title="调整模型前向">旋转 90°</button></div><input id="model-file" type="file" accept=".glb" hidden/><p id="model-status" role="status">正在加载 BMW 模型…</p><p class="attribution" id="attribution"></p><div class="swatch-row"><span>车身涂装</span><div id="swatches"><button class="swatch active" data-color="#b9d7d3" style="--swatch:#b9d7d3" aria-label="冰川青" aria-pressed="true"></button><button class="swatch" data-color="#dc744b" style="--swatch:#dc744b" aria-label="赤陶橙" aria-pressed="false"></button><button class="swatch" data-color="#a7adbb" style="--swatch:#a7adbb" aria-label="雾银灰" aria-pressed="false"></button></div></div></section>
<section class="control-section"><h3><span>02</span> 来流条件</h3><div class="range-label"><label for="speed">入口风速</label><output id="speed-output">80 <small>km/h</small></output></div><input id="speed" type="range" min="0" max="200" step="1" value="80"/><div class="range-ticks"><span>0</span><span>100</span><span>200 km/h</span></div><div class="range-label second-range"><label for="yaw">偏航角</label><output id="yaw-output">0 <small>°</small></output></div><input id="yaw" type="range" min="-30" max="30" step="1" value="0"/><div class="range-ticks"><span>−30°</span><span>0°</span><span>+30°</span></div></section>
<section class="control-section"><h3><span>03</span> 可视化图层</h3><label class="toggle-row" for="flow"><span><strong>动态气流线</strong><small>观察绕流与尾流示意</small></span><input type="checkbox" id="flow" checked role="switch"/></label><label class="toggle-row" for="tunnel"><span><strong>风洞边界</strong><small>显示透明测试段</small></span><input type="checkbox" id="tunnel" checked role="switch"/></label><label class="toggle-row" for="grid"><span><strong>参考网格</strong><small>辅助判断空间与尺度</small></span><input type="checkbox" id="grid" checked role="switch"/></label></section>
<div class="run-controls"><button id="pause" class="primary">Ⅱ 暂停气流</button><button id="reset" class="reset" title="恢复默认参数" aria-label="恢复默认参数">↺</button></div><div class="note"><span>ⓘ</span><p>本实验室为交互演示。流线由程序生成，不代表真实流场，也不用于工程性能判断。</p></div></aside></main><footer><span><span class="footer-mark">≋</span> AEROLAB <span class="footer-divider">/</span> 空气动力学探索空间</span><span>3D 交互 · 可视化演示</span></footer>`;

const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b171b');
scene.fog = new THREE.Fog('#0b171b', 19, 48);
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
camera.position.set(-9, 4.5, 10);
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { viewport.innerHTML = '<div class="error">当前环境无法开启 WebGL。请使用支持硬件加速的现代浏览器打开。</div>'; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .8;
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, .04);
scene.environment = environment.texture;
scene.environmentIntensity = .65;
room.dispose(); pmrem.dispose();
viewport.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '可旋转的车辆风洞三维场景');
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, .8, 0);controls.autoRotate=!matchMedia('(prefers-reduced-motion: reduce)').matches;controls.autoRotateSpeed=.22;controls.enabled=false; controls.enableDamping = true; controls.minDistance = 6; controls.maxDistance = 25; controls.maxPolarAngle = Math.PI / 2 - 0.03;
scene.add(new THREE.HemisphereLight('#d4eeee', '#26353b', 2.5));
const key = new THREE.DirectionalLight('#e4fffc', 2.4); key.position.set(-4, 9, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8; scene.add(key);
const rim = new THREE.DirectionalLight('#71b6e9', 3); rim.position.set(4, 3, -6); scene.add(rim);
const material = (color, metalness = 0, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100,100), material('#091519')); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.045; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(30, 60, '#315254', '#24373c'); grid.material.transparent = true; grid.material.opacity = 0.52; scene.add(grid);
const platform = new THREE.Mesh(new THREE.BoxGeometry(12, .12, 5.4), material('#112329', .1, .9)); platform.position.y = -.01; platform.receiveShadow = true; scene.add(platform);
const platformEdge = new THREE.LineSegments(new THREE.EdgesGeometry(platform.geometry), new THREE.LineBasicMaterial({color:'#507577',transparent:true,opacity:.5})); platformEdge.position.copy(platform.position); scene.add(platformEdge);
const tunnel = new THREE.Group(); scene.add(tunnel);
const tunnelGeo = new THREE.BoxGeometry(12, 3.7, 5.4);
const edges = new THREE.LineSegments(new THREE.EdgesGeometry(tunnelGeo), new THREE.LineBasicMaterial({color:'#619290',transparent:true,opacity:.35})); edges.position.y = 1.91; tunnel.add(edges);
for (const x of [-6,6]) { const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.08,3.7,5.4)), new THREE.LineBasicMaterial({color:'#78aaa4',transparent:true,opacity:.5})); ring.position.set(x,1.91,0); tunnel.add(ring); }
const glass = new THREE.Mesh(tunnelGeo, new THREE.MeshPhysicalMaterial({color:'#8ccec8',transparent:true,opacity:.025,side:THREE.BackSide,depthWrite:false,roughness:.1})); glass.position.y = 1.91; tunnel.add(glass);
const vehicleRoot = new THREE.Group(); vehicleRoot.position.y = .12; scene.add(vehicleRoot);
const car = new THREE.Group(); vehicleRoot.add(car);
const bodyMat = material('#b9d7d3', .65, .27);
const windowMat = material('#10292f', .55, .17);
// Cross sections along the length create a tapered body rather than a box.
function loft(sections, mat) {
 const vertices = [], indices = [];
 for(const [x,bottom,top,width,roofWidth] of sections) vertices.push(x,bottom,-width,x,bottom,width,x,top,roofWidth,x,top,-roofWidth);
 for(let i=0;i<sections.length-1;i++) for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=(i+1)*4+(j+1)%4,d=(i+1)*4+j;indices.push(a,b,d,b,c,d);}
 indices.push(0,3,2,0,2,1); const n=(sections.length-1)*4; indices.push(n,n+1,n+2,n,n+2,n+3);
 for(let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
 const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
 const mesh = new THREE.Mesh(geometry,mat); mesh.castShadow = true; mesh.receiveShadow = true; car.add(mesh); return mesh;
}
loft([[-2.35,.37,.65,.73,.72],[-1.85,.3,.86,.94,.87],[-.8,.3,.96,.97,.84],[.85,.32,.99,.95,.85],[1.85,.38,.84,.9,.83],[2.25,.45,.75,.76,.74]],bodyMat);
loft([[-1.02,.91,.94,.79,.77],[-.42,.94,1.48,.79,.64],[.58,.97,1.49,.78,.63],[1.3,.92,.98,.79,.76]],windowMat);
loft([[-.45,1.46,1.50,.65,.64],[.55,1.47,1.52,.64,.63],[.73,1.40,1.45,.66,.65]],bodyMat);
function box(w,h,d,x,y,z,mat) {const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); mesh.position.set(x,y,z); mesh.castShadow=true; car.add(mesh); return mesh;}
const dark = material('#10191d', .1, .7);
for (const x of [-1.48,1.43]) for (const z of [-.92,.92]) {
 const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.23,40),dark); wheel.rotation.x=Math.PI/2; wheel.position.set(x,.4,z); wheel.castShadow=true; car.add(wheel);
 const hub = new THREE.Mesh(new THREE.CylinderGeometry(.265,.265,.245,32),material('#64797d',.85,.3)); hub.rotation.x=Math.PI/2; hub.position.copy(wheel.position); car.add(hub);
 const cap = new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.255,20),dark); cap.rotation.x=Math.PI/2; cap.position.copy(wheel.position); car.add(cap);
 for(let i=0;i<5;i++){const spoke=box(.045,.48,.255,x,.4,z,material('#abc2c4',.8,.3));spoke.rotation.z=i*Math.PI/5;}
}
box(3.6,.10,1.86,0,.33,0,dark);
box(.055,.15,1.05,-2.355,.48,0,dark);
for(const z of [-.51,.51]) {box(.045,.07,.36,-2.36,.67,z,new THREE.MeshStandardMaterial({color:'#d9fffa',emissive:'#b0fff3',emissiveIntensity:2}));box(.04,.055,.4,2.255,.72,z,new THREE.MeshStandardMaterial({color:'#ee6657',emissive:'#ee3020',emissiveIntensity:1.3}));box(.24,.10,.16,-.55,1.04,z>0?1:-1,bodyMat);}
box(.07,.45,1.35,.3,1.22,0,bodyMat).rotation.z=-.04;

// Structured test section: steel frames, light strips and outlet fan.
const structureMat = material('#28434a', .7, .4);
const stripMat = new THREE.MeshBasicMaterial({color:'#70e4d2'});
function tunnelBox(size, position, mat=structureMat){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);mesh.position.set(...position);tunnel.add(mesh);return mesh;}
for(const x of [-6,-3,3,6]) {
 for(const z of [-2.73,2.73]) tunnelBox([.09,3.85,.09],[x,1.93,z]);
 tunnelBox([.09,.09,5.55],[x,3.85,0]);
}
for(const z of [-2.65,2.65]) {tunnelBox([12,.05,.05],[0,.13,z],stripMat);tunnelBox([12,.045,.045],[0,3.78,z],stripMat);}
function sceneLabel(text,x,y,z,color){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='#0c1c24';ctx.fillRect(0,0,512,90);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(2,2,508,86);ctx.fillStyle=color;ctx.font='500 32px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,55);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthWrite:false}));sprite.position.set(x,y,z);sprite.scale.set(2.35,.41,1);tunnel.add(sprite);}
sceneLabel('01  INLET  →',-5.2,4.2,0,'#94ffe1');sceneLabel('02  OUTLET  →',5.2,4.2,0,'#ffc387');
const fan = new THREE.Group(); fan.position.set(6.25,1.9,0);tunnel.add(fan);
const fanRing=new THREE.Mesh(new THREE.TorusGeometry(1.56,.065,8,64),structureMat);fanRing.rotation.y=Math.PI/2;fan.add(fanRing);
const rotor=new THREE.Group();fan.add(rotor);
for(let i=0;i<8;i++){const blade=new THREE.Mesh(new THREE.BoxGeometry(.055,1.2,.27),material('#43636b',.5,.6));const angle=i*Math.PI/4;blade.position.set(0,Math.cos(angle)*.82,Math.sin(angle)*.82);blade.rotation.x=angle;rotor.add(blade);}
const flowGroup = new THREE.Group(); scene.add(flowGroup);
const flowMat = new THREE.MeshBasicMaterial({color:'#54d6bd',transparent:true,opacity:.32,depthWrite:false});
const lanes=[];
for(let row=0;row<4;row++)for(let col=0;col<9;col++)lanes.push({y:.34+row*.72,z:-2.25+col*.5625,phase:(row*9+col)*.618%1});
const traces=new THREE.Group();flowGroup.add(traces);
const smokeGroup=new THREE.Group();flowGroup.add(smokeGroup);
const smokeMaterial=new THREE.MeshBasicMaterial({color:'#d2fff0',transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending});
const wakeMaterial=new THREE.MeshBasicMaterial({color:'#ffc58a',transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending});
const particlePositions=new Float32Array(lanes.length*5*3);
const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));
const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;const glowContext=glowCanvas.getContext('2d');const gradient=glowContext.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.15,'#d9fff0');gradient.addColorStop(.4,'#72eecb99');gradient.addColorStop(1,'#72eecb00');glowContext.fillStyle=gradient;glowContext.fillRect(0,0,64,64);
const particles=new THREE.Points(particleGeo,new THREE.PointsMaterial({color:'#c5ffed',map:new THREE.CanvasTexture(glowCanvas),size:.15,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));particles.frustumCulled=false;flowGroup.add(particles);
const streakPositions=new Float32Array(lanes.length*5*2*3);const streakColors=new Float32Array(streakPositions.length);
const streakGeo=new THREE.BufferGeometry();streakGeo.setAttribute('position',new THREE.BufferAttribute(streakPositions,3));streakGeo.setAttribute('color',new THREE.BufferAttribute(streakColors,3));
const streaks=new THREE.LineSegments(streakGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));streaks.frustumCulled=false;flowGroup.add(streaks);
let speed=80,yaw=0,running=true,progress=0;
let vehicleSize=new THREE.Vector3(4.7,1.65,2.1);
// Analytic envelope only: this responds to overall size, not a surface CFD solve.
function point(t,lane){
 const x=-6+t*12, angle=yaw*Math.PI/180;
 const halfX=(vehicleSize.x*Math.abs(Math.cos(angle))+vehicleSize.z*Math.abs(Math.sin(angle)))/2;
 const halfZ=(vehicleSize.z*Math.abs(Math.cos(angle))+vehicleSize.x*Math.abs(Math.sin(angle)))/2;
 const influence=Math.exp(-Math.pow(x/(halfX+.5),4));
 const proximity=Math.exp(-Math.pow(lane.z/(halfZ+.24),6));
 const vertical=Math.max(0,1-lane.y/(vehicleSize.y+.55));
 const side=Math.abs(lane.z)>.32;
 let z=lane.z+(side?Math.sign(lane.z)*Math.max(0,halfZ+.24-Math.abs(lane.z))*influence*vertical:0);
 let y=lane.y+(side?.34:Math.max(0,vehicleSize.y+.32-lane.y))*influence*proximity;
 const wake=Math.max(0,Math.min(1,(x-halfX)/2))*Math.exp(-Math.pow(lane.z/1.5,2));
 z+=Math.sin(x*3.1+lane.y*2)*.085*wake; y+=Math.cos(x*2.8+lane.z)*.055*wake;
 return new THREE.Vector3(x,y+.10,z);
}
let lastEnvelope="";
function updateLines(){
 vehicleRoot.rotation.y=-yaw*Math.PI/180;
 const envelope=`${yaw}/${vehicleSize.toArray()}`;if(envelope===lastEnvelope)return;lastEnvelope=envelope;
 for(const child of [...traces.children]){child.geometry.dispose();traces.remove(child);}
 for(const child of [...smokeGroup.children]){child.geometry.dispose();smokeGroup.remove(child);}
 for(const lane of lanes){const points=Array.from({length:65},(_,s)=>point(s/64,lane));const curve=new THREE.CatmullRomCurve3(points);traces.add(new THREE.Mesh(new THREE.TubeGeometry(curve,80,.009,4,false),flowMat));}
 const smokePaths=[
  {z:-.72,y:1.22,material:smokeMaterial,spread:.30},
  {z:.72,y:1.22,material:smokeMaterial,spread:.30},
  {z:0,y:1.72,material:wakeMaterial,spread:.46}
 ];
 for(const path of smokePaths){
  const points=[];for(let s=0;s<34;s++){const x=-2.8+s*.27;const wake=Math.max(0,(x-1.2)/3.8);points.push(new THREE.Vector3(x,path.y+Math.sin(s*.55)*.04+wake*.16,path.z+Math.sin(s*.7)*path.spread*wake));}
  const curve=new THREE.CatmullRomCurve3(points);smokeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve,70,.035,7,false),path.material));
 }
 vehicleRoot.rotation.y=-yaw*Math.PI/180;
}
function sync(){document.querySelector('#speed-output').innerHTML=`${speed} <small>km/h</small>`;document.querySelector('#yaw-output').innerHTML=`${yaw>0?'+':''}${yaw} <small>°</small>`;document.querySelector('#metric-speed').innerHTML=`${speed}<small>km/h</small>`;document.querySelector('#metric-yaw').innerHTML=`${yaw}<small>°</small>`;const state=!running?'已暂停':speed===0?'静止':'运行中';document.querySelector('#metric-state').textContent=state;document.querySelector('#scene-status').textContent=`气流${state}`;document.querySelector('#pause').textContent=running?'Ⅱ 暂停气流':'▷ 继续气流';document.querySelector('.live-dot').classList.toggle('paused',!running||speed===0);flowMat.opacity=speed===0?.08:.32;updateLines();}
document.querySelector('#speed').addEventListener('input',e=>{speed=Number(e.target.value);sync();});
document.querySelector('#yaw').addEventListener('input',e=>{yaw=Number(e.target.value);sync();});
document.querySelector('#pause').onclick=()=>{running=!running;sync();};
for(const [id,object] of [['flow',flowGroup],['tunnel',tunnel],['grid',grid]])document.querySelector(`#${id}`).onchange=e=>object.visible=e.target.checked;
function setView(view){const positions={perspective:[-9,4.5,10],side:[0,3,14],top:[0,15,.01],front:[-14,2.5,0]};camera.position.set(...positions[view]);controls.target.set(0,.8,0);controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelector('#reset-view').onclick=()=>setView('perspective');
function setColor(button){bodyMat.color.set(button.dataset.color);paintMaterials.forEach(m=>m.color.set(button.dataset.color));document.querySelectorAll('.swatch').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});}
document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>setColor(b));
document.querySelector('#reset').onclick=()=>{speed=80;yaw=0;running=true;progress=0;document.querySelector('#speed').value=80;document.querySelector('#yaw').value=0;for(const [id,object] of [['flow',flowGroup],['tunnel',tunnel],['grid',grid]]){document.querySelector(`#${id}`).checked=true;object.visible=true;}modelQuarterTurns=0;normalizeActiveModel();setColor(document.querySelector('.swatch'));setView('perspective');sync();};
let activeModel=null, modelQuarterTurns=0, paintMaterials=[], modelRequest=0, customModel=null;
const loaderManager=new THREE.LoadingManager();
const draco=new DRACOLoader(loaderManager);draco.setDecoderPath('/draco/');
const loader=new GLTFLoader(loaderManager);loader.setDRACOLoader(draco);
const modelSelect=document.querySelector('#model-select');
function normalizeActiveModel(){
 if(!activeModel){vehicleSize.set(4.7,1.65,2.1);return;}
 const parent=activeModel.parent;activeModel.removeFromParent();
 activeModel.position.set(0,0,0);activeModel.scale.setScalar(1);activeModel.rotation.y=modelQuarterTurns*Math.PI/2;
 activeModel.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(activeModel),size=bounds.getSize(new THREE.Vector3());
 const largest=Math.max(size.x,size.y,size.z);
 if(!Number.isFinite(largest)||largest<=0){if(parent)parent.add(activeModel);throw new Error('模型没有可显示的有效几何体');}
 activeModel.scale.setScalar(4.7/largest);activeModel.updateMatrixWorld(true);
 const fitted=new THREE.Box3().setFromObject(activeModel),center=fitted.getCenter(new THREE.Vector3());
 activeModel.position.set(-center.x,-fitted.min.y,-center.z);vehicleSize.copy(fitted.getSize(new THREE.Vector3()));
 if(parent)parent.add(activeModel);
}
function disposeModel(root){root?.traverse(o=>{o.geometry?.dispose();for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat){for(const value of Object.values(mat))if(value?.isTexture)value.dispose();mat.dispose();}});}
async function selectModel(kind, file){
 const request=++modelRequest;
 const status=document.querySelector('#model-status');status.textContent=kind==='aero'?'简化参考模型':'正在加载模型…';
 document.querySelector('#import-model').disabled=true;
 try {
 let next=null;
 if(kind!=='aero'){
 let buffer;
 if(file){if(file.size>80*1024*1024)throw new Error('请选择小于 80 MB 的 GLB 文件');buffer=await file.arrayBuffer();}
 else {const response=await fetch('/models/bmw-m4.glb');if(!response.ok)throw new Error('内置模型下载失败');buffer=await response.arrayBuffer();}
 const view=new DataView(buffer);if(buffer.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw new Error('文件不是有效的 glTF 2.0 GLB');
 const length=view.getUint32(12,true);const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
 if([...(json.buffers||[]),...(json.images||[])].some(x=>x.uri&&!x.uri.startsWith('data:')))throw new Error('请导出包含全部贴图的单文件 GLB');
 const gltf=await loader.parseAsync(buffer,'');next=gltf.scene;
 if(request!==modelRequest){disposeModel(next);return;}
 let meshes=0;next.traverse(o=>{if(o.isMesh){meshes++;o.castShadow=true;o.receiveShadow=true;}});if(!meshes){disposeModel(next);throw new Error('模型中没有网格');}
 // BMW is authored with length on Z. Turn the nose toward the inlet (-X).
 next.rotation.y=kind==='bmw'?-Math.PI/2:0;
 const aligned=new THREE.Group();aligned.add(next);next=aligned;
 }
 if(request!==modelRequest)return;
 const previous=activeModel;activeModel=next;modelQuarterTurns=0;
 try{normalizeActiveModel();}catch(error){activeModel=previous;disposeModel(next);throw error;}
 if(previous){vehicleRoot.remove(previous);disposeModel(previous);}
 paintMaterials=[];if(next){vehicleRoot.add(next);next.traverse(o=>{if(o.isMesh&&o.material?.name==='Meshesbody151Mtl')paintMaterials.push(o.material);});}
 car.visible=kind==='aero';modelSelect.value=kind;
 document.querySelector('#vehicle-name').textContent=kind==='bmw'?'BMW M4 Competition':kind==='aero'?'Aero GT':file.name;
 document.querySelector('#vehicle-description').textContent=kind==='bmw'?'M Package · SRT Performance':kind==='aero'?'概念运动轿跑 · 简化模型':'本地导入 · 自定义模型';
 document.querySelector('#attribution').innerHTML=kind==='bmw'?'<a href="https://github.com/coopercodes/bmwGLB" target="_blank" rel="noopener">模型来源 / 下载</a> · SRT Performance · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>':kind==='custom'?'文件仅在本机读取，不会上传。':'';
 document.querySelector('.swatch-row').hidden=kind==='custom';
 status.textContent=kind==='aero'?'简化参考模型':'加载完成 · 最长边统一缩放为 4.7 显示单位';
 window.dispatchEvent(new CustomEvent('aerolab-model',{detail:{name:kind==='bmw'?'BMW M4':kind==='aero'?'Aero GT':file.name,subtitle:kind==='bmw'?'Competition':kind==='aero'?'Concept vehicle':'Custom model'}}));
 if(kind==='custom')customModel=file;
 sync();
 }catch(error){if(request===modelRequest){status.textContent='加载失败：'+error.message+'。已保留当前车辆。';modelSelect.value=activeModel?(customModel&&document.querySelector('#vehicle-name').textContent===customModel.name?'custom':'bmw'):'aero';}}
 finally{if(request===modelRequest)document.querySelector('#import-model').disabled=false;}
}
modelSelect.onchange=()=>selectModel(modelSelect.value,modelSelect.value==='custom'?customModel:null);
document.querySelector('#import-model').onclick=()=>document.querySelector('#model-file').click();
document.querySelector('#model-file').onchange=e=>{const file=e.target.files[0];if(!file)return;if(![...modelSelect.options].some(o=>o.value==='custom'))modelSelect.add(new Option('本地 GLB 模型','custom'));selectModel('custom',file);e.target.value='';};
document.querySelector('#rotate-model').onclick=()=>{if(!activeModel)return;modelQuarterTurns=(modelQuarterTurns+1)%4;normalizeActiveModel();sync();};
new ResizeObserver(()=>{const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}).observe(viewport);
sync();selectModel('bmw');const clock=new THREE.Clock();
const headColor=new THREE.Color('#a7ffe0'),tailColor=new THREE.Color('#ffc782');
renderer.setAnimationLoop(()=>{
 const delta=Math.min(clock.getDelta(),.05);if(document.body.dataset.mode==='cfd')return;if(running){progress+=delta*speed/650;rotor.rotation.x+=delta*speed/45;}
 let i=0,j=0;for(const lane of lanes)for(let p=0;p<5;p++){
 const t=(progress+lane.phase+p/5)%1;const position=point(t,lane);position.toArray(particlePositions,i);i+=3;
 const tail=point(Math.max(0,t-.045),lane);tail.toArray(streakPositions,j);position.toArray(streakPositions,j+3);
 const color=t>.73?tailColor:headColor;color.clone().multiplyScalar(.15).toArray(streakColors,j);color.toArray(streakColors,j+3);j+=6;
 }
 particleGeo.attributes.position.needsUpdate=true;streakGeo.attributes.position.needsUpdate=true;streakGeo.attributes.color.needsUpdate=true;controls.update();renderer.render(scene,camera);
});

window.addEventListener('aerolab-mode',event=>{const experiment=event.detail==='experiment';controls.enabled=experiment;controls.autoRotate=!experiment&&running&&!matchMedia('(prefers-reduced-motion: reduce)').matches;setView('perspective');});
window.addEventListener('aerolab-motion',event=>{controls.autoRotate=event.detail&&document.body.dataset.mode!=='experiment';running=event.detail;sync();});

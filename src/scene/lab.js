import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AIRCRAFT } from '../simulation/config.js';
import { sampleWind } from '../wind/field.js';
export const toView = p => new THREE.Vector3(p[0],p[2],-p[1]);
const basis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
function dispose(root) { root.traverse(o=>{o.geometry?.dispose();const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of ms){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}}); }
export function createLab(host, read, report) {
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#0c141c');scene.fog=new THREE.FogExp2('#0c141c',.033);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','无人机三维飞行场景，可拖动旋转与缩放');
  const camera=new THREE.PerspectiveCamera(44,1,.05,150);camera.position.set(7,5.7,8.5);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1.6,0);controls.enableDamping=true;controls.minDistance=1.8;controls.maxDistance=30;controls.maxPolarAngle=Math.PI*.49;
  scene.add(new THREE.HemisphereLight('#c5def0','#203344',2));const sun=new THREE.DirectionalLight('#eef7ff',4);sun.position.set(4,10,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;sun.shadow.bias=-.0002;scene.add(sun);const rim=new THREE.DirectionalLight('#8ba8ff',2);rim.position.set(-4,3,-3);scene.add(rim);
  const mat=(color,metalness=.4,roughness=.4)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),mat('#111d28',.2,.9));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(40,80,'#3b5061','#233340');grid.position.y=.012;grid.material.transparent=true;grid.material.opacity=.55;scene.add(grid);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.66,.69,80),new THREE.MeshBasicMaterial({color:'#c6e78a',transparent:true,opacity:.7,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.022;scene.add(ring);
  const pad=new THREE.Mesh(new THREE.CircleGeometry(.65,64),new THREE.MeshBasicMaterial({color:'#aecf73',transparent:true,opacity:.06}));pad.rotation.x=-Math.PI/2;pad.position.y=.023;scene.add(pad);
  function box(parent,size,pos,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const craft=new THREE.Group();scene.add(craft);const frame=new THREE.Group();craft.add(frame);
  const shell=mat('#d5ded9',.6,.3),dark=mat('#202a33',.5,.5),accent=mat('#cce990',.3,.35);
  box(frame,[.22,.085,.16],[0,0,0],shell);box(frame,[.145,.025,.11],[0,.055,0],dark);box(frame,[.04,.03,.05],[.125,-.02,0],dark);
  const lens=new THREE.Mesh(new THREE.SphereGeometry(.023,16,12),mat('#2d7f91',.8,.13));lens.position.set(.149,-.019,0);frame.add(lens);
  const rotors=[];const positions=[[1,1],[-1,1],[-1,-1],[1,-1]];
  positions.forEach(([x,y],i)=>{
    const a=AIRCRAFT.arm,arm=box(frame,[Math.sqrt(2)*a,.035,.037],[x*a/2,0,-y*a/2],dark);arm.rotation.y=Math.atan2(y,x);
    const motor=new THREE.Mesh(new THREE.CylinderGeometry(.035,.032,.055,24),dark);motor.position.set(x*a,.025,-y*a);motor.castShadow=true;frame.add(motor);
    const prop=new THREE.Group();prop.position.set(x*a,.065,-y*a);craft.add(prop);box(prop,[.24,.006,.021],[0,0,0],i<2?accent:shell);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.016,16),dark);prop.add(hub);rotors.push(prop);
    const led=new THREE.Mesh(new THREE.SphereGeometry(.009,12,8),new THREE.MeshBasicMaterial({color:i===0||i===3?'#e0f998':'#ff9171'}));led.position.set(x*a,-.01,-y*a);frame.add(led);
    const skid=box(frame,[.018,.1,.018],[x*.11,-.085,-y*.07],dark);skid.rotation.z=x*.2;
  });
  const axes=new THREE.AxesHelper(.5);axes.quaternion.copy(basis);craft.add(axes);
  const target=new THREE.Group();scene.add(target);for(const r of [.24,.28]){const m=new THREE.Mesh(new THREE.TorusGeometry(r,.005,6,48),new THREE.MeshBasicMaterial({color:'#d6ed98',transparent:true,opacity:.6}));m.rotation.x=Math.PI/2;target.add(m);}
  const environment=new THREE.Group();scene.add(environment);let oldScene='';
  function setEnvironment(mode) {
    dispose(environment);environment.clear();
    if(mode==='tunnel') {
      const material=new THREE.LineBasicMaterial({color:'#698293',transparent:true,opacity:.5});
      for(const x of [-6,-3,0,3,6]) {const e=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.035,5,6)),material);e.position.set(x,2.5,0);environment.add(e);}
      for(const z of [-3,3])box(environment,[12,.04,.04],[0,5,z],mat('#8eaaa0'));
    }
    if(mode==='obstacle') {box(environment,[1,3,1.6],[-2.5,1.5,0],mat('#344454',.3,.7));const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,3,1.6)),new THREE.LineBasicMaterial({color:'#698493'}));edge.position.set(-2.5,1.5,0);environment.add(edge);}
  }
  const count=1600,points=new Float32Array(count*3),colors=new Float32Array(count*3),world=new Float32Array(count*3);
  let randSeed=314159;function rand(){randSeed=(1664525*randSeed+1013904223)>>>0;return randSeed/4294967296;}
  function spawn(i){world[i*3]=(rand()-.5)*14;world[i*3+1]=(rand()-.5)*10;world[i*3+2]=.15+rand()*5.8;}
  for(let i=0;i<count;i++)spawn(i);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const particles=new THREE.Points(geometry,new THREE.PointsMaterial({size:.038,vertexColors:true,transparent:true,opacity:.75,depthWrite:false}));particles.frustumCulled=false;scene.add(particles);
  const arrows=new THREE.Group();scene.add(arrows);const arrowList=[];
  for(let x=-4;x<=4;x+=2)for(let y=-3;y<=3;y+=2){const a=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),toView([x,y,2]),.6,0x8ecce0,.1,.045);arrows.add(a);arrowList.push({arrow:a,point:new THREE.Vector3(x,y,2)});}
  const sliceGeo=new THREE.PlaneGeometry(12,6,32,18);sliceGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(sliceGeo.attributes.position.count*3),3));const slice=new THREE.Mesh(sliceGeo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.26,depthWrite:false}));slice.position.y=3;scene.add(slice);
  const wash=new THREE.Group();craft.add(wash);for(const [x,y]of positions){const cone=new THREE.Mesh(new THREE.CylinderGeometry(.12,.3,1,24,1,true),new THREE.MeshBasicMaterial({color:'#9bc9ef',transparent:true,opacity:.08,side:THREE.DoubleSide,depthWrite:false}));cone.position.set(x*.23,-.5,-y*.23);wash.add(cone);}
  const trailGeometry=new THREE.BufferGeometry();const trailPoints=new Float32Array(6000*3);trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPoints,3));const trail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:'#e3ae73',transparent:true,opacity:.7}));trail.frustumCulled=false;scene.add(trail);let trailCount=0,lastTrail=-1;
  const windArrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(0,3,0),1,0xe8b17e,.16,.065);scene.add(windArrow);
  const probe=new THREE.Mesh(new THREE.SphereGeometry(.035,12,10),new THREE.MeshBasicMaterial({color:'#efc38a'}));scene.add(probe);
  const color=new THREE.Color(),p=new THREE.Vector3();let previous=0,lastTime=0,lastCamera='',frameNo=0,disposed=false,custom=null,assetGeneration=0;
  const observer=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(host);
  renderer.setAnimationLoop(now=>{
    if(disposed)return;const wallDt=Math.min((now-previous)/1000,.05);previous=now;
    const {snapshot:s,config:c,field,probe:probePosition=[0,0,2],resetToken=0}=read();if(!s)return;
    if(c.scene!==oldScene){setEnvironment(c.scene);oldScene=c.scene;}
    craft.position.copy(toView(s.position));const q=new THREE.Quaternion(...s.quaternion);craft.quaternion.copy(basis).multiply(q).multiply(basis.clone().invert());target.position.copy(toView(s.target));
    const dt=s.time>=lastTime?Math.min(.08,s.time-lastTime):0;if(s.time<lastTime||resetToken!==trail.userData.reset){trailCount=0;lastTrail=-1;trail.userData.reset=resetToken;randSeed=314159;for(let i=0;i<count;i++)spawn(i);}lastTime=s.time;
    rotors.forEach((r,i)=>{r.rotation.y+=s.motors[i]*Math.PI/30*dt*(i%2?-1:1);});wash.visible=c.downwash;
    if(c.camera!==lastCamera){if(c.camera==='top')camera.position.copy(craft.position).add(new THREE.Vector3(.01,10,0));else if(c.camera==='side')camera.position.copy(craft.position).add(new THREE.Vector3(0,1,10));else camera.position.copy(craft.position).add(new THREE.Vector3(7,4.3,8.5));controls.target.copy(craft.position);lastCamera=c.camera;}
    if(c.camera==='follow'){const offset=new THREE.Vector3(3,2,4).applyQuaternion(craft.quaternion);camera.position.lerp(craft.position.clone().add(offset),Math.min(1,wallDt*5));controls.target.lerp(craft.position,Math.min(1,wallDt*5));}
    controls.update();particles.visible=c.particles;geometry.setDrawRange(0,c.density);arrows.visible=c.arrows;slice.visible=c.slice;
    const sample=(point)=>sampleWind(point,s.time,c,field);
    if(c.particles)for(let i=0;i<c.density;i++) {
      p.fromArray(world,i*3);let v=sample(p);
      if(!v){spawn(i);points[i*3]=1e5;points[i*3+1]=1e5;points[i*3+2]=1e5;continue;}
      p.addScaledVector(v,dt);if(Math.abs(p.x)>7||Math.abs(p.y)>5||p.z<.1||p.z>6){spawn(i);p.fromArray(world,i*3);}else p.toArray(world,i*3);
      toView(p.toArray()).toArray(points,i*3);color.setHSL(.55-Math.min(v.length()/15,1)*.42,.65,.65);color.toArray(colors,i*3);
    }
    geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
    if(frameNo++%4===0){
      for(const {arrow,point}of arrowList){const v=sample(point);arrow.visible=!!v&&v.length()>.03;if(arrow.visible){arrow.setDirection(toView(v.toArray()).normalize());arrow.setLength(.15+Math.min(v.length()/10,1)*.8,.12,.05);}}
      if(c.slice){const pos=sliceGeo.attributes.position,col=sliceGeo.attributes.color;for(let i=0;i<pos.count;i++){p.set(pos.getX(i),0,pos.getY(i)+3);const v=sample(p);color.setHSL(.58-Math.min((v?.length()||0)/15,1)*.47,.7,v?.length()>.01?.55:.13);col.setXYZ(i,color.r,color.g,color.b);}col.needsUpdate=true;}
    }
    if(s.time-lastTrail>=.05&&trailCount<6000){craft.position.toArray(trailPoints,trailCount++*3);lastTrail=s.time;}trailGeometry.setDrawRange(0,trailCount);trailGeometry.attributes.position.needsUpdate=true;
    probe.position.copy(toView(probePosition));windArrow.position.copy(craft.position).add(new THREE.Vector3(0,.8,0));const wv=toView(s.wind);windArrow.visible=wv.length()>.03;if(windArrow.visible){windArrow.setDirection(wv.normalize());windArrow.setLength(.35+Math.min(Math.hypot(...s.wind)/8,1),.15,.06);}
    renderer.render(scene,camera);
  });
  async function importModel(file){const generation=++assetGeneration;const buffer=await file.arrayBuffer();const gltf=await new GLTFLoader().parseAsync(buffer,'');if(disposed||generation!==assetGeneration){dispose(gltf.scene);return;}const object=gltf.scene;const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());if(Math.max(size.x,size.y,size.z)<=0){dispose(object);throw Error('模型没有可用几何');}object.position.sub(bounds.getCenter(new THREE.Vector3()));const wrapper=new THREE.Group();wrapper.add(object);wrapper.scale.setScalar(.7/Math.max(size.x,size.y,size.z));if(custom){craft.remove(custom);dispose(custom);}frame.visible=false;craft.add(wrapper);custom=wrapper;report?.('已导入外观模型；按 0.70 m 最大尺寸缩放，质量和旋翼位置仍由实验参数定义。');}
  return { importModel, rotateModel(){if(custom)custom.rotation.y+=Math.PI/2;}, restoreModel(){if(custom){craft.remove(custom);dispose(custom);custom=null;}frame.visible=true;}, dispose(){disposed=true;assetGeneration++;observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();dispose(scene);renderer.dispose();renderer.domElement.remove();} };
}

import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const stops=['#173d86','#258ca8','#75c7a2','#edd876','#e36c43','#941c36'].map(c=>new THREE.Color(c));
function color(v,min,max){const t=Math.max(0,Math.min(.999999,(v-min)/(max-min||1)))*(stops.length-1);return stops[Math.floor(t)].clone().lerp(stops[Math.floor(t)+1],t%1);}
export default function FieldViewer({jobId}){
 const host=useRef(),[data,setData]=useState(null),[error,setError]=useState(''),[field,setField]=useState('speed'),[view,setView]=useState('side');
 useEffect(()=>{let alive=true;setData(null);setError('');fetch(`/api/cfd/jobs/${jobId}/fields`).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);return j;}).then(j=>alive&&setData(j)).catch(e=>alive&&setError(e.message));return()=>{alive=false;};},[jobId]);
 useEffect(()=>{
  if(!data||!host.current)return;
  const hostElement=host.current;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#101c26');
  const camera=new THREE.PerspectiveCamera(36,1,.01,150);camera.position.set(...(field==='surface'?(view==='side'?[0,1.2,8]:[-5,3.5,6]):(view==='side'?[2,1.8,17]:[-7,8,14])));
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setError('无法初始化 WebGL');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;hostElement.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(field==='surface'?0:2,field==='surface'?.65:1.8,0);controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=40;
  const positions=[],colors=[];const range=field==='surface'?data.ranges.surfacePressure:data.ranges[field];
  function vertex(x,y,z,v){positions.push(x,z,-y);color(v,...range).toArray(colors,colors.length);}
  if(field==='surface'){
   for(let i=0;i<data.surface.length;i+=4)vertex(data.surface[i],data.surface[i+1],data.surface[i+2],data.surface[i+3]);
  }else{
   for(const r of data.rectangles){const [a,b,c,d]=r;const val=r[field==='speed'?4:5];for(const [x,z] of [[a,c],[b,c],[b,d],[a,c],[b,d],[a,d]])vertex(x,0,z,val);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});scene.add(new THREE.Mesh(geometry,material));
  if(field!=='surface'){
   const box=new THREE.Mesh(new THREE.BoxGeometry(3,1,1.2),new THREE.MeshBasicMaterial({color:'#16232b'}));box.position.set(0,.65,0);scene.add(box);
   const edges=new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),new THREE.LineBasicMaterial({color:'#e8efdf'}));edges.position.copy(box.position);scene.add(edges);
   // Sparse arrows use the solved Ux/Uz, not an animated analytic curve.
   const occupied=new Set();
   for(const r of data.rectangles){if(r[2]<.2||r[3]>2.5||r[0]<-4||r[1]>9)continue;const x=(r[0]+r[1])/2,z=(r[2]+r[3])/2;const bin=`${Math.floor(x/.6)},${Math.floor(z/.28)}`;if(occupied.has(bin))continue;occupied.add(bin);const n=Math.hypot(r[6],r[7]);if(n<.1)continue;scene.add(new THREE.ArrowHelper(new THREE.Vector3(r[6]/n,r[7]/n,0),new THREE.Vector3(x,z,.02),.22,0xffffff,.06,.035));}
  }
  const grid=new THREE.GridHelper(28,28,'#60746d','#253c40');grid.position.y=-.008;scene.add(grid);
  const resize=new ResizeObserver(()=>{const w=hostElement.clientWidth,h=hostElement.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(hostElement);
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  return()=>{resize.disconnect();renderer.setAnimationLoop(null);controls.dispose();scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});renderer.dispose();renderer.domElement.remove();};
 },[data,field,view]);
 const range=data&&(field==='surface'?data.ranges.surfacePressure:data.ranges[field]);
 return <section className="field-viewer"><h3>真实流场 <small>OpenFOAM · 迭代 {data?.time||'—'}</small></h3><div className="field-toolbar"><label>显示变量<select aria-label="流场变量" value={field} onChange={e=>setField(e.target.value)}><option value="speed">中心截面 · 速度大小 m/s</option><option value="pressure">中心截面 · 相对压力 Pa</option><option value="surface">车体表面 · 相对压力 Pa</option></select></label><button onClick={()=>setView(v=>v==='side'?'perspective':'side')}>{view==='side'?'切换三维视角':'重置侧视'}</button></div>{error?<p role="alert" className="cfd-error">{error}</p>:<div className="field-canvas" ref={host} aria-label="真实计算流场，可拖动旋转和缩放">{!data&&<p>正在读取实际 VTK 场数据…</p>}</div>}{range&&<div className="field-scale"><span>{range[0].toFixed(2)}</span><i/><span>{range[1].toFixed(2)} {field==='speed'?'m/s':'Pa'}</span></div>}<p className="cfd-help">{field==='surface'?'实际车体表面压力':'y = 0 m 截面，取正侧相邻单元值；箭头来自求解速度'}。采用原始单元数值，无平滑、无预设流线。坐标与几何单位为米，压力以出口为零基准。</p></section>;
}

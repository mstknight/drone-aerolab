import { VERSION, DT, validateConfig } from '../simulation/config.js';
export function metrics(rows, config) {
  if (!rows.length) return { rms:0, max:0, tilt:0, saturated:0, recovery:null };
  let sum=0, max=0, tilt=0, saturated=0, stableStart=null, recovery=null;
  const end=config.wind==='gust'?config.gustStart+config.gustDuration:null;
  for(let i=0;i<rows.length;i++) {
    const r=rows[i]; sum+=r.error*r.error; max=Math.max(max,r.error);
    // Body +Z world projection from quaternion, robust beyond Euler singularities.
    const [qx,qy]=r.quaternion; tilt=Math.max(tilt,Math.acos(Math.max(-1,Math.min(1,1-2*(qx*qx+qy*qy))))*180/Math.PI);
    if(r.saturated&&i>0) saturated+=r.time-rows[i-1].time;
    if(end!==null && r.time>=end) { if(r.error<.15) { stableStart??=r.time; if(r.time-stableStart>=2&&recovery===null) recovery=Math.max(0,stableStart-end); } else stableStart=null; }
  }
  return { rms:Math.sqrt(sum/rows.length),max,tilt,saturated,recovery };
}
export function record(config,rows,field=null) { return { schema:'drone-experiment-v1',version:VERSION,created:new Date().toISOString(),coordinates:'world-z-up',simulationDt:DT,sampleDt:.05,config:{...config},field:field?.raw||null,rows,metrics:metrics(rows,config) }; }
export function parseRecord(raw) {
  if(raw?.schema!=='drone-experiment-v1'||raw.version!==VERSION||raw.coordinates!=='world-z-up'||!Array.isArray(raw.rows)||!raw.rows.length||raw.rows.length>24001) throw Error('不支持的实验记录或记录长度超过 20 分钟');
  raw.config=validateConfig(raw.config);
  let previous=-1;
  for(const r of raw.rows) {
    for(const [k,n] of Object.entries({position:3,velocity:3,quaternion:4,omega:3,angles:3,desiredAngles:3,motors:4,wind:3,target:3})) if(!Array.isArray(r[k])||r[k].length!==n||!r[k].every(Number.isFinite)) throw Error('记录字段无效：'+k);
    if(!Number.isFinite(r.time)||r.time<=previous||!Number.isFinite(r.error)||r.error<0||typeof r.saturated!=='boolean') throw Error('记录时间或误差无效');
    if(Math.abs(Math.hypot(...r.quaternion)-1)>.01) throw Error('姿态四元数未归一化'); previous=r.time;
  }
  return raw;
}
export function download(name,data,type='application/json') {
  const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data)],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function csv(rows) {
  const head='time_s,x_m,y_m,z_m,vx_ms,vy_ms,vz_ms,roll_deg,pitch_deg,yaw_deg,wind_x_ms,wind_y_ms,wind_z_ms,motor1_rpm,motor2_rpm,motor3_rpm,motor4_rpm,error_m,saturated';
  return head+'\n'+rows.map(r=>[r.time,...r.position,...r.velocity,...r.angles,...r.wind,...r.motors,r.error,Number(r.saturated)].join(',')).join('\n');
}

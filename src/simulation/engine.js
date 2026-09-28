import { Vector3, Quaternion, Euler } from 'three';
import { AIRCRAFT, DT, DEFAULTS } from './config.js';
import { Controller, mix } from '../control/controller.js';
import { sampleWind } from '../wind/field.js';
export class Simulation {
  constructor(config = DEFAULTS, field = null) {
    this.config = { ...config }; this.field = field;
    this.aircraft = { ...AIRCRAFT, mass: config.mass, inertia: AIRCRAFT.inertia.map(x => x * config.mass / AIRCRAFT.mass) };
    this.controller = new Controller(); this.ticks = 0;
    const hover = Math.sqrt(this.aircraft.mass * 9.81 / 4 / AIRCRAFT.thrustCoefficient);
    this.state = { time: 0, position: new Vector3(0,0,config.altitude), velocity: new Vector3(), quaternion: new Quaternion(), omega: new Vector3(), motors: [hover,hover,hover,hover], saturated: false, status: 'ready', wind: new Vector3(), desired: new Quaternion() };
    this.target = new Vector3(0,0,config.altitude);
  }
  getTarget(t = this.state.time) {
    if (this.config.task === 'waypoints') { const phase = Math.max(0,t-3) * .22; return new Vector3(1.4 * Math.sin(phase), 1.4 * (1-Math.cos(phase)), this.config.altitude); }
    return new Vector3(0,0,this.config.altitude);
  }
  step() {
    const s = this.state, a = this.aircraft, c = this.config;
    if (['ground','bounds','collision','field-exit','invalid'].includes(s.status)) return false;
    this.target = this.getTarget();
    const wind = sampleWind(s.position, s.time, c, this.field);
    if (!wind) { s.status = 'field-exit'; return false; }
    s.wind.copy(wind);
    const output = this.controller.step(s, this.target, c, a, DT); s.desired.copy(output.desired);
    const commands = mix(output.thrust, output.torque, a);
    s.saturated = commands.some(x => x < 0 || x > a.maxThrust);
    const forces = commands.map((f, i) => {
      const speed = Math.sqrt(Math.max(0,Math.min(a.maxThrust,f)) / a.thrustCoefficient);
      s.motors[i] += (speed-s.motors[i]) * (1-Math.exp(-DT/a.motorTau));
      return a.thrustCoefficient * s.motors[i] ** 2;
    });
    const torque = new Vector3(), aero = new Vector3(), inv = s.quaternion.clone().invert();
    const offsets = [[a.arm,a.arm,1],[-a.arm,a.arm,-1],[-a.arm,-a.arm,1],[a.arm,-a.arm,-1]];
    for (let i=0;i<4;i++) {
      const [x,y,spin] = offsets[i], r = new Vector3(x,y,0), worldR = r.clone().applyQuaternion(s.quaternion);
      torque.x += y*forces[i]; torque.y -= x*forces[i]; torque.z += spin*a.torqueRatio*forces[i];
      const localWind = sampleWind(s.position.clone().add(worldR),s.time,c,this.field);
      if (!localWind) { s.status='field-exit'; return false; }
      const velocity = new Vector3().crossVectors(s.omega,r).applyQuaternion(s.quaternion).add(s.velocity);
      const relative = localWind.sub(velocity).applyQuaternion(inv);
      const drag = new Vector3(...relative.toArray().map((v,j)=>.5*1.225*a.dragArea[j]*v*Math.abs(v)/4));
      torque.add(new Vector3().crossVectors(r,drag)); aero.add(drag.applyQuaternion(s.quaternion));
    }
    torque.addScaledVector(s.omega,-.018);
    const momentum = new Vector3(...s.omega.toArray().map((v,i)=>v*a.inertia[i]));
    const angular = torque.sub(new Vector3().crossVectors(s.omega,momentum));
    s.omega.add(new Vector3(...angular.toArray().map((v,i)=>v/a.inertia[i])).multiplyScalar(DT));
    const w = s.omega.length(); if(w>0) s.quaternion.multiply(new Quaternion().setFromAxisAngle(s.omega.clone().normalize(),w*DT)).normalize();
    const force = new Vector3(0,0,forces.reduce((x,y)=>x+y,0)).applyQuaternion(s.quaternion).add(aero).add(new Vector3(0,0,-a.mass*9.81));
    s.velocity.addScaledVector(force,DT/a.mass); s.position.addScaledVector(s.velocity,DT);
    s.time = ++this.ticks * DT; s.status='running';
    if (![...s.position.toArray(),...s.velocity.toArray(),...s.quaternion.toArray(),...s.omega.toArray()].every(Number.isFinite)) s.status='invalid';
    else if (s.position.z <= .18) { s.position.z=.18; s.status='ground'; }
    else if (Math.abs(s.position.x)>10 || Math.abs(s.position.y)>10 || s.position.z>9) s.status='bounds';
    else if (c.scene==='obstacle' && Math.abs(s.position.x+2.5)<.88 && Math.abs(s.position.y)<1.18 && s.position.z<3.2) s.status='collision';
    else if (c.scene==='tunnel' && (Math.abs(s.position.y)>2.6 || s.position.z>4.7 || Math.abs(s.position.x)>6)) s.status='collision';
    return true;
  }
  snapshot() {
    const s=this.state, e=new Euler().setFromQuaternion(s.quaternion,'ZYX'), d=new Euler().setFromQuaternion(s.desired,'ZYX');
    return { time:s.time, position:s.position.toArray(), velocity:s.velocity.toArray(), quaternion:s.quaternion.toArray(), omega:s.omega.toArray(), angles:[e.x,e.y,e.z].map(x=>x*180/Math.PI), desiredAngles:[d.x,d.y,d.z].map(x=>x*180/Math.PI), motors:s.motors.map(x=>x*60/(2*Math.PI)), wind:s.wind.toArray(), target:this.getTarget().toArray(), error:s.position.distanceTo(this.getTarget()), saturated:s.saturated, status:s.status };
  }
}

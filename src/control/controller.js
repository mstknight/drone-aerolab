import { Vector3, Quaternion, Matrix4 } from 'three';
const limit = (x, n) => Math.max(-n, Math.min(n, x));
export class Controller {
  constructor() { this.integral = new Vector3(); }
  step(s, target, config, aircraft, dt) {
    const mass = aircraft.mass;
    if (config.mode === 'fixed') return { thrust: mass * 9.81 * config.fixedThrottle, torque: new Vector3(), desired: new Quaternion() };
    const error = target.clone().sub(s.position), acceleration = new Vector3();
    if (config.mode === 'position') {
      // Freeze integral while actuators are saturated; clamp the accumulated bias.
      if (!s.saturated) this.integral.addScaledVector(error, dt);
      this.integral.set(limit(this.integral.x, 3), limit(this.integral.y, 3), limit(this.integral.z, 2));
      acceleration.copy(error).multiplyScalar(2.1 * config.gain).addScaledVector(s.velocity, -2.6 * Math.sqrt(config.gain)).addScaledVector(this.integral, .7);
    } else {
      acceleration.z = error.z * 3 - s.velocity.z * 2.8;
    }
    acceleration.z = limit(acceleration.z, 5);
    const horizontal = Math.hypot(acceleration.x, acceleration.y), maxHorizontal = (9.81 + acceleration.z) * Math.tan(config.tiltLimit * Math.PI / 180);
    if (horizontal > maxHorizontal) { acceleration.x *= maxHorizontal / horizontal; acceleration.y *= maxHorizontal / horizontal; }
    const force = acceleration.add(new Vector3(0, 0, 9.81)).multiplyScalar(mass);
    const z = force.clone().normalize(), y = new Vector3().crossVectors(z, new Vector3(1, 0, 0)).normalize(), x = new Vector3().crossVectors(y, z);
    const desired = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
    const errorQ = s.quaternion.clone().invert().multiply(desired), sign = errorQ.w < 0 ? -1 : 1;
    const rateTarget = new Vector3(errorQ.x, errorQ.y, errorQ.z).multiplyScalar(10 * sign);
    const torque = rateTarget.sub(s.omega).multiplyScalar(16);
    torque.set(torque.x * aircraft.inertia[0], torque.y * aircraft.inertia[1], torque.z * aircraft.inertia[2]);
    const bodyZ = new Vector3(0, 0, 1).applyQuaternion(s.quaternion);
    return { thrust: Math.max(0, force.dot(bodyZ)), torque, desired };
  }
}
export function mix(thrust, torque, aircraft) {
  const a = aircraft.arm, k = aircraft.torqueRatio;
  return [[a,a,1],[-a,a,-1],[-a,-a,1],[a,-a,-1]].map(([x,y,spin]) => thrust / 4 + y * torque.x / (4*a*a) - x * torque.y / (4*a*a) + spin * torque.z / (4*k));
}

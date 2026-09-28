import { Vector3 } from 'three';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// One deterministic continuous field for physics, arrows, probes and tracers.
export function sampleWind(p, t, c, imported = null) {
  if (c.wind === 'cfd') { if (!imported) throw Error('请先导入 CFD 场'); return imported.sample(p); }
  if (c.wind === 'calm') return new Vector3();
  const angle = c.direction * Math.PI / 180;
  let amplitude = c.speed;
  if (c.wind === 'gust') { const phase = (t - c.gustStart) / c.gustDuration; amplitude *= phase > 0 && phase < 1 ? Math.sin(Math.PI * phase) ** 2 : 0; }
  if (c.wind === 'periodic') amplitude *= .65 + .35 * Math.sin(t * 1.7);
  const v = c.wind === 'vertical' ? new Vector3(0, 0, amplitude) : new Vector3(Math.cos(angle) * amplitude, Math.sin(angle) * amplitude, 0);
  if (c.wind === 'turbulent') {
    const s = c.seed * 1.618;
    // Fourier modes with spatial phase: smooth, repeatable educational turbulence proxy.
    v.x += c.turbulence * (Math.sin(t * 1.3 + p.y * .8 + s) + .4 * Math.sin(t * 3.1 + p.z + s * 2));
    v.y += c.turbulence * (Math.cos(t * 1.7 + p.z * .9 + s) + .3 * Math.sin(t * 2.7 + p.x + s));
    v.z += c.turbulence * .5 * Math.sin(t * 2 + p.x * .7 + p.y * .4 + s);
  }
  if (c.scene === 'obstacle') {
    const dx = p.x + 2.5, dy = p.y;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .8 && p.z < 3) return new Vector3();
    const along = dx * Math.cos(angle) + dy * Math.sin(angle), cross = -dx * Math.sin(angle) + dy * Math.cos(angle);
    if (along > .5) {
      const wake = Math.exp(-along / 4) * Math.exp(-((cross / (.7 + along * .15)) ** 2)) * clamp((3.5 - p.z) / .8, 0, 1);
      v.multiplyScalar(1 - .65 * wake); v.z += Math.sin(t * 2 + along * 2) * wake * c.speed * .14;
    }
  }
  return v;
}
export function parseField(raw) {
  if (raw?.schema !== 'drone-wind-grid-v1' || raw.units !== 'm/s' || raw.coordinates !== 'world-z-up' || raw.frame !== 'fixed-world' || typeof raw.source !== 'string' || !raw.source.trim()) throw Error('需要 drone-wind-grid-v1、m/s、world-z-up、fixed-world 及来源字段');
  const vector = x => Array.isArray(x) && x.length === 3 && x.every(Number.isFinite);
  if (!vector(raw.origin) || !vector(raw.spacing) || raw.spacing.some(x => x <= 0) || !vector(raw.dimensions) || raw.dimensions.some(n => !Number.isInteger(n) || n < 2 || n > 100)) throw Error('网格坐标或尺寸无效');
  const [nx, ny, nz] = raw.dimensions;
  if (!Array.isArray(raw.velocity) || raw.velocity.length !== nx * ny * nz * 3 || !raw.velocity.every(Number.isFinite)) throw Error('速度数组长度错误或包含非有限值');
  const sample = p => {
    const xyz = [p.x, p.y, p.z].map((x, i) => (x - raw.origin[i]) / raw.spacing[i]);
    if (xyz.some((x, i) => x < 0 || x > raw.dimensions[i] - 1)) return null;
    const base = xyz.map((x, i) => Math.min(Math.floor(x), raw.dimensions[i] - 2));
    const f = xyz.map((x, i) => x - base[i]), out = new Vector3();
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const index = ((base[2] + k) * ny * nx + (base[1] + j) * nx + base[0] + i) * 3;
      const w = (i ? f[0] : 1 - f[0]) * (j ? f[1] : 1 - f[1]) * (k ? f[2] : 1 - f[2]);
      out.x += raw.velocity[index] * w; out.y += raw.velocity[index + 1] * w; out.z += raw.velocity[index + 2] * w;
    }
    return out;
  };
  return { raw, sample };
}

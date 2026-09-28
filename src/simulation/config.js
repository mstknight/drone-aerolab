export const VERSION = 'drone-lab-1.0';
export const DT = 1 / 200;
export const AIRCRAFT = { mass: 1.2, inertia: [.018, .018, .032], arm: .23, rotorRadius: .12, maxThrust: 7.5, thrustCoefficient: 1.8e-5, torqueRatio: .016, motorTau: .045, dragArea: [.065, .065, .11] };
export const DEFAULTS = { wind: 'gust', speed: 5, direction: 90, gustStart: 3, gustDuration: 5, turbulence: .5, seed: 42, mode: 'position', task: 'hover', altitude: 2, gain: 1, tiltLimit: 30, scene: 'open', particles: true, arrows: true, slice: false, downwash: false, camera: 'orbit', density: 650, mass: 1.2, fixedThrottle: 1 };
export const WIND_NAMES = { calm: '无风基准', steady: '恒定来流', gust: '平滑阵风', periodic: '周期变风', vertical: '垂直气流', turbulent: '相关扰动', cfd: '导入 CFD 场' };
export const MODE_NAMES = { fixed: '固定电机', attitude: '姿态稳定', position: '定点悬停' };
export const PRESETS = {
  calm: { label: '01 · 无风悬停', wind: 'calm', speed: 0, mode: 'position', scene: 'open' },
  gust: { label: '02 · 侧向阵风', wind: 'gust', speed: 5, direction: 90, mode: 'position', scene: 'open' },
  turbulent: { label: '03 · 紊动抗扰', wind: 'turbulent', speed: 4, turbulence: 1.2, mode: 'position', scene: 'open' },
  obstacle: { label: '04 · 障碍尾流', wind: 'steady', speed: 5, direction: 0, mode: 'position', scene: 'obstacle' },
};
export function validateConfig(raw) {
  if (!raw || typeof raw !== 'object') throw Error('实验配置格式错误');
  const c = { ...DEFAULTS };
  const choices = { wind: Object.keys(WIND_NAMES), mode: Object.keys(MODE_NAMES), task: ['hover', 'waypoints'], scene: ['open', 'tunnel', 'obstacle'], camera: ['orbit', 'follow', 'top', 'side'] };
  for (const [k, values] of Object.entries(choices)) if (k in raw) { if (!values.includes(raw[k])) throw Error('无效配置：' + k); c[k] = raw[k]; }
  const bounds = { speed: [0, 15], direction: [-180, 180], gustStart: [0, 60], gustDuration: [.5, 60], turbulence: [0, 3], seed: [0, 1000000], altitude: [.5, 6], gain: [.3, 2], tiltLimit: [5, 45], density: [100, 1600], mass: [.6, 2], fixedThrottle: [0, 2] };
  for (const [k, [lo, hi]] of Object.entries(bounds)) if (k in raw) { if (typeof raw[k] !== 'number' || !Number.isFinite(raw[k]) || raw[k] < lo || raw[k] > hi) throw Error('参数超出范围：' + k); c[k] = raw[k]; }
  for (const k of ['particles', 'arrows', 'slice', 'downwash']) if (k in raw) { if (typeof raw[k] !== 'boolean') throw Error('无效开关：' + k); c[k] = raw[k]; }
  if (!Number.isInteger(c.seed) || !Number.isInteger(c.density)) throw Error('种子和粒子数量必须为整数');
  return c;
}

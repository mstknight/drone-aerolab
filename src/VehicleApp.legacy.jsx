import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './landing.css';
import CfdPanel from './CfdPanel.jsx';

function BackgroundVideo({ enabled, moving }) {
  const video = useRef(null);
  const [ready, setReady] = useState(false);
  const src = import.meta.env.VITE_HLS_VIDEO_URL;
  useEffect(() => {
    if (!src) return;
    let disposed = false, hls;
    const element = video.current;
    const fallback = () => { setReady(false); element.pause(); };
    element.addEventListener('error', fallback);
    if (element.canPlayType('application/vnd.apple.mpegurl')) element.src = src;
    else import('hls.js').then(({ default: Hls }) => {
      if (disposed || !Hls.isSupported()) return;
      hls = new Hls({ maxBufferLength: 20 });
      hls.loadSource(src); hls.attachMedia(element);
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) { fallback(); hls.destroy(); } });
    }).catch(fallback);
    return () => { disposed = true; hls?.destroy(); element.removeEventListener('error', fallback); element.removeAttribute('src'); element.load(); };
  }, [src]);
  useEffect(() => {
    const element = video.current;
    if (src && enabled && moving) element.play().catch(() => setReady(false));
    else element.pause();
  }, [src, enabled, moving]);
  return <video ref={video} className={`cinema-video ${ready && enabled ? 'is-ready' : ''}`} autoPlay muted loop playsInline aria-hidden="true" onPlaying={() => setReady(true)} />;
}

function App() {
  const [mode, setMode] = useState('landing');
  const [about, setAbout] = useState(false);
  const [moving, setMoving] = useState(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [error, setError] = useState('');
  const [vehicle, setVehicle] = useState({name:'BMW M4',subtitle:'Competition'});
  useEffect(()=>{const update=e=>setVehicle(e.detail);window.addEventListener('aerolab-model',update);return()=>window.removeEventListener('aerolab-model',update);},[]);
  const initialized = useRef(false);
  const latest = useRef({ mode, moving });
  latest.current = { mode, moving };
  const aboutButton = useRef(null);
  const closeButton = useRef(null);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    import('./main.js').then(() => {
      window.dispatchEvent(new CustomEvent('aerolab-mode', { detail: latest.current.mode }));
      window.dispatchEvent(new CustomEvent('aerolab-motion', { detail: latest.current.moving }));
    }).catch(() => setError('三维场景暂时无法加载，请使用支持 WebGL 的浏览器刷新重试。'));
  }, []);
  useEffect(() => {
    document.body.dataset.mode = mode;
    window.dispatchEvent(new CustomEvent('aerolab-mode', { detail: mode }));
  }, [mode]);
  useEffect(() => {
    if (!about) return;
    closeButton.current?.focus();
    const key = e => {
      if (e.key === 'Escape') { setAbout(false); aboutButton.current?.focus(); }
      if(e.key === 'Tab') { e.preventDefault(); closeButton.current?.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [about]);
  const toggleMotion = () => {
    setMoving(v => !v);
    window.dispatchEvent(new CustomEvent('aerolab-motion', { detail: !moving }));
  };
  const enter = () => setMode('experiment');
  return <>
    <div id="lab-host" />
    <BackgroundVideo enabled={mode === 'landing'} moving={moving} />
    <div className="cinema-shade" aria-hidden="true" />
    <header className="glass-nav">
      <button className="wordmark" onClick={() => setMode('landing')} aria-label="AEROLAB 首页"><span className="wind-mark">≋</span>AERO<span className="wordmark-light">LAB</span><span className="wordmark-dot">•</span></button>
      <nav aria-label="主导航">
        <button className={mode === 'landing' ? 'nav-active' : ''} onClick={() => setMode('landing')}>探索<span>01</span></button>
        <button className={mode === 'experiment' ? 'nav-active' : ''} onClick={enter}>风洞实验<span>02</span></button>
        <button className={mode === 'cfd' ? 'nav-active' : ''} onClick={() => setMode('cfd')}>CFD 计算<span>03</span></button>
        <button ref={aboutButton} onClick={() => setAbout(true)}>关于项目<span>03</span></button>
      </nav>
      <button className="mobile-cfd" onClick={()=>setMode(mode==='cfd'?'landing':'cfd')}>{mode==='cfd'?'首页':'CFD'}</button>
      <button className="nav-cta" onClick={mode === 'landing' ? enter : () => setMode('landing')}>{mode === 'landing' ? '进入实验室' : '返回探索'}<span>↗</span></button>
    </header>
    {mode === 'landing' ? <>
      <div className="scene-caption"><span className="signal" /> VIRTUAL WIND TUNNEL <span className="caption-divider">/</span> VOL. 001</div>
      <section className="hero-content" aria-labelledby="hero-title">
        <div className="hero-kicker"><span /> ENGINEERED TO EXPLORE</div>
        <h1 id="hero-title">看见风。<br /><span>重新理解速度。</span></h1>
        <p>在空气与车身之间，发现设计的另一面。<br />走进你的虚拟风洞，让每一次探索都有迹可循。</p>
        <div className="hero-actions"><button className="hero-primary" onClick={enter}>开启风洞实验<span>↗</span></button><button className="hero-secondary" onClick={toggleMotion}><span>{moving ? 'Ⅱ' : '▷'}</span>{moving ? '暂停背景' : '播放背景'}</button></div>
      </section>
      <div className="feature-stamp"><span className="stamp-index">01 / FEATURED VEHICLE</span><strong>{vehicle.name}<span>{vehicle.subtitle}</span></strong><div className="stamp-rule" /><p>3D 车辆模型 <span>·</span> 交互式气流探索</p><button onClick={enter}>探索这辆车 <span>↗</span></button></div>
      <footer className="landing-footer"><span>DESIGNED FOR CURIOSITY.</span><span><i /> 实时演示 · 非工程仿真</span><span>SCROLL LESS. EXPLORE MORE. ↗</span></footer>
    </> : mode === 'cfd' ? <CfdPanel /> : <div className="experiment-label"><span>LIVE EXPERIMENT / 01</span><h1>风洞实验室<span>。</span></h1><p>旋转视角，调节来流，观察变化。</p></div>}
    {error && <div className="load-error" role="alert">{error}</div>}
    {about && <div className="modal-backdrop" onClick={() => {setAbout(false);aboutButton.current?.focus();}}><section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e=>e.stopPropagation()}><button ref={closeButton} className="close-dialog" aria-label="关闭项目介绍" onClick={()=>{setAbout(false);aboutButton.current?.focus();}}>×</button><span className="hero-kicker">THE SPACE BETWEEN AIR & FORM</span><h2 id="about-title">为好奇心而造。</h2><p>AEROLAB 是一个可以自由探索的虚拟车辆风洞。你可以加载车辆、调整风速与偏航角，观察示意气流。</p><p>BMW M4 模型由 SRT Performance 制作，采用 CC BY 4.0 许可。模型署名与下载入口位于实验控制台。</p><small>气流为程序生成的视觉演示，不是 CFD 计算结果。</small></section></div>}
  </>;
}

createRoot(document.getElementById('app')).render(<App />);

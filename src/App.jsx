import React, { useState, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB4xVmVO6KmP50JttZhwS5u-r9edUstGhg",
  authDomain: "typesound-pro.firebaseapp.com",
  projectId: "typesound-pro",
  storageBucket: "typesound-pro.firebasestorage.app",
  messagingSenderId: "623967944937",
  appId: "1:623967944937:web:750ce163d7bd60072f3078",
  measurementId: "G-MSEBPCPSLK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'typesound-pro-v9';

const PRESET_COLORS = ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#808080', '#000000'];

const App = () => {
  const [user, setUser] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const [scripts, setScripts] = useState([{ id: '1', startTime: 0, text: "タップして入力", fontSize: 40, speed: 100, textColor: "#ffffff", outlineColor: "#000000" }]);
  const [activeId, setActiveId] = useState('1');
  const [displayText, setDisplayText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [aspectRatio, setAspectRatio] = useState('portrait');
  const [soundBank, setSoundBank] = useState([]);
  const [selectedSoundId, setSelectedSoundId] = useState('default');
  const [volume, setVolume] = useState(0.5);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const videoRef = useRef(null);
  const typingTimer = useRef(null);
  const prevTimeRef = useRef(0);
  const audioCtxRef = useRef(null);
  const audioBuffersRef = useRef({});

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error(err));
    onAuthStateChanged(auth, setUser);
  }, []);

  const initAudio = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const handleSoundUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ctx = await initAudio();
    const arrayBuffer = await file.arrayBuffer();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const id = `local-${Date.now()}`;
      audioBuffersRef.current[id] = audioBuffer;
      setSoundBank(prev => [{ id, name: `🎵 ${file.name}` }, ...prev]);
      setSelectedSoundId(id);
    } catch (err) { alert("音源エラー"); }
  };

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'sounds');
    return onSnapshot(q, async (snapshot) => {
      const ctx = await initAudio();
      const sounds = [];
      snapshot.forEach(async (doc) => {
        const data = doc.data();
        sounds.push({ id: doc.id, ...data });
        if (!audioBuffersRef.current[doc.id] && data.downloadURL) {
          try {
            const resp = await fetch(data.downloadURL);
            const ab = await resp.arrayBuffer();
            audioBuffersRef.current[doc.id] = await ctx.decodeAudioData(ab);
          } catch (e) { console.error("Sound Load Error", e); }
        }
      });
      setSoundBank(prev => [...prev.filter(s => s.id.startsWith('local-')), ...sounds]);
    });
  }, [user]);

  const playSound = async () => {
    try {
      const ctx = await initAudio();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3 * volume, ctx.currentTime);
      g.connect(ctx.destination);
      if (selectedSoundId !== 'default' && audioBuffersRef.current[selectedSoundId]) {
        const src = ctx.createBufferSource();
        src.buffer = audioBuffersRef.current[selectedSoundId];
        src.connect(g);
        src.start();
      } else {
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.connect(g);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) {}
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const now = videoRef.current.currentTime;
    const prev = prevTimeRef.current;
    setCurrentTime(now);
    if (isPlaying) {
      scripts.forEach(s => {
        if (prev < s.startTime && now >= s.startTime) triggerTyping(s);
      });
    }
    prevTimeRef.current = now;
  };

  const triggerTyping = (script) => {
    if (typingTimer.current) clearInterval(typingTimer.current);
    let i = 0;
    const fullText = script.text || "";
    setDisplayText("");
    typingTimer.current = setInterval(() => {
      if (i < fullText.length) {
        const char = fullText[i];
        if (char !== undefined) {
          setDisplayText((prev) => prev + char);
          if (char !== " " && char !== "\n") playSound();
        }
        i++;
      } else { clearInterval(typingTimer.current); }
    }, script.speed || 100);
  };

  const handleTogglePlay = async () => {
    if (!videoRef.current || !videoSrc) return;
    await initAudio();
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      if (typingTimer.current) clearInterval(typingTimer.current);
    } else {
      if (videoRef.current.currentTime >= duration) {
        videoRef.current.currentTime = 0;
        prevTimeRef.current = 0;
      }
      setDisplayText("");
      setIsPlaying(true);
      videoRef.current.play();
    }
  };

  const updateActive = (key, val) => {
    setScripts(scripts.map(s => s.id === activeId ? { ...s, [key]: val } : s));
  };

  const deleteScript = (id) => {
    if (scripts.length <= 1) return;
    const nextScripts = scripts.filter(s => s.id !== id);
    setScripts(nextScripts);
    setActiveId(nextScripts[0].id);
  };

  const currentScript = scripts.find(s => s.id === activeId) || scripts[0];
  const heavyStroke = `2px 2px 0 ${currentScript.outlineColor}, -2px -2px 0 ${currentScript.outlineColor}, 2px -2px 0 ${currentScript.outlineColor}, -2px 2px 0 ${currentScript.outlineColor}, 4px 4px 10px rgba(0,0,0,0.5)`;

  const BigSlider = ({ label, icon, value, min, max, step, onChange }) => (
    <div style={{ marginBottom: '15px', background: '#27272a', padding: '12px', borderRadius: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '8px' }}>
        <span>{icon} {label}</span>
        <span style={{ color: '#f97316', fontWeight: 'bold' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', height: '8px', accentColor: '#f97316' }} />
    </div>
  );

  return (
    <div style={{ backgroundColor: '#09090b', minHeight: '100vh', color: '#e4e4e7', paddingBottom: '110px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '10px' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '5px' }}>
          <div style={{ display: 'flex', gap: '3px' }}>
            <button onClick={() => setAspectRatio('portrait')} style={{ background: aspectRatio === 'portrait' ? '#f97316' : '#18181b', border: 'none', padding: '8px', borderRadius: '8px', color: 'white', fontSize: '11px' }}>📱 縦</button>
            <button onClick={() => setAspectRatio('landscape')} style={{ background: aspectRatio === 'landscape' ? '#f97316' : '#18181b', border: 'none', padding: '8px', borderRadius: '8px', color: 'white', fontSize: '11px' }}>💻 横</button>
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <label style={{ background: '#f97316', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>📂 動画<input type="file" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && setVideoSrc(URL.createObjectURL(e.target.files[0]))} /></label>
            <label style={{ background: '#3b82f6', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>🎵 音源<input type="file" style={{ display: 'none' }} onChange={handleSoundUpload} /></label>
          </div>
        </header>

        {/* プレビュー・中央配置エリア */}
        <div style={{ 
          position: 'relative', width: '100%', aspectRatio: aspectRatio === 'portrait' ? '9/16' : '16/9', 
          background: '#000', borderRadius: '20px', overflow: 'hidden', border: '1px solid #27272a', margin: '0 auto 10px'
        }}>
          {videoSrc && <video ref={videoRef} src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(e) => setDuration(e.target.duration)} onEnded={() => setIsPlaying(false)} playsInline />}
          
          {/* ★ ここが「中央固定」の肝：Flexboxで文字全体を常にど真ん中へ */}
          <div style={{ 
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', zIndex: 10, pointerEvents: isPlaying ? 'none' : 'auto'
          }}>
            {!isPlaying ? (
              <textarea 
                style={{ 
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  fontSize: `${currentScript.fontSize}px`, fontWeight: 'bold', textAlign: 'center',
                  color: currentScript.textColor, textShadow: heavyStroke, resize: 'none', 
                  fontFamily: 'inherit', lineHeight: '1.2'
                }} 
                value={currentScript.text} 
                onChange={(e) => updateActive('text', e.target.value)}
                onFocus={() => currentScript.text.includes("入力") && updateActive('text', "")}
              />
            ) : (
              <p style={{ 
                width: '100%', fontSize: `${currentScript.fontSize}px`, fontWeight: 'bold', textAlign: 'center',
                color: currentScript.textColor, textShadow: heavyStroke, whiteSpace: 'pre-wrap', margin: 0, lineHeight: '1.2'
              }}>{displayText}</p>
            )}
          </div>
        </div>

        {/* タイムライン */}
        <div style={{ background: '#18181b', padding: '12px', borderRadius: '15px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#f97316', fontWeight: 'bold', marginBottom: '5px' }}>
            <span>{currentTime.toFixed(2)}s</span>
            <span>{duration.toFixed(2)}s</span>
          </div>
          <input type="range" min="0" max={duration || 100} step="0.01" value={currentTime} onChange={(e) => {
            const nt = parseFloat(e.target.value);
            if(videoRef.current) videoRef.current.currentTime = nt;
            setCurrentTime(nt);
            prevTimeRef.current = nt;
            setDisplayText("");
          }} style={{ width: '100%', height: '20px', accentColor: '#f97316' }} />
          
          <div style={{ display: 'flex', overflowX: 'auto', gap: '5px', marginTop: '10px' }}>
            <button onClick={() => {
              const newId = Date.now().toString();
              setScripts([...scripts, { id: newId, startTime: currentTime, text: "新規字幕", fontSize: 40, speed: 100, textColor: "#ffffff", outlineColor: "#000000" }]);
              setActiveId(newId);
            }} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>➕ 追加</button>
            {scripts.map(s => (
              <button key={s.id} onClick={() => { setActiveId(s.id); if(videoRef.current) videoRef.current.currentTime = s.startTime; setCurrentTime(s.startTime); prevTimeRef.current = s.startTime; }} style={{ 
                background: activeId === s.id ? '#f97316' : '#27272a', border: activeId === s.id ? '2px solid white' : 'none', 
                padding: '8px 12px', borderRadius: '8px', color: 'white', fontSize: '11px', whiteSpace: 'nowrap'
              }}>{s.startTime.toFixed(1)}s</button>
            ))}
          </div>
        </div>

        {/* 調整エリア */}
        <div style={{ background: '#18181b', padding: '15px', borderRadius: '20px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
            <select value={selectedSoundId} onChange={(e) => setSelectedSoundId(e.target.value)} style={{ flex: 1, background: '#27272a', color: 'white', border: '1px solid #3f3f46', borderRadius: '10px', padding: '10px', fontSize: '12px' }}>
              <option value="default">標準タイピング音</option>
              {soundBank.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <BigSlider label="ボリューム" icon="🔊" min="0" max="1" step="0.1" value={volume} onChange={setVolume} />
          <BigSlider label="サイズ" icon="🅰️" min="10" max="150" step="1" value={currentScript.fontSize} onChange={(v) => updateActive('fontSize', parseInt(v))} />
          <BigSlider label="スピード" icon="⚡" min="20" max="500" step="10" value={currentScript.speed} onChange={(v) => updateActive('speed', parseInt(v))} />

          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button onClick={() => setShowColorPicker(true)} style={{ flex: 2, background: '#27272a', border: '1px solid #3f3f46', borderRadius: '10px', padding: '12px', color: 'white', fontSize: '13px', fontWeight: 'bold' }}>🎨 色・縁取り</button>
            <button onClick={() => deleteScript(activeId)} style={{ flex: 1, background: '#ef4444', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '13px' }}>🗑 削除</button>
          </div>
        </div>
      </div>

      {/* 固定再生ボタン */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '15px', background: 'linear-gradient(transparent, #000)', zIndex: 100 }}>
        <button onClick={handleTogglePlay} style={{ width: '100%', maxWidth: '600px', margin: '0 auto', display: 'block', background: isPlaying ? '#3f3f46' : '#f97316', border: 'none', padding: '15px', borderRadius: '15px', color: 'white', fontWeight: 'bold', fontSize: '16px' }}>
          {isPlaying ? '⏸ 停止' : '▶️ プレビュー再生'}
        </button>
      </div>

      {/* カラーピッカー（モーダル） */}
      {showColorPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowColorPicker(false)}>
          <div style={{ background: '#18181b', padding: '20px', borderRadius: '20px', width: '90%', maxWidth: '300px' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '12px', marginBottom: '10px' }}>文字色</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {PRESET_COLORS.map(c => <button key={c} onClick={() => updateActive('textColor', c)} style={{ background: c, border: currentScript.textColor === c ? '3px solid #f97316' : 'none', width: '40px', height: '40px', borderRadius: '10px' }} />)}
            </div>
            <p style={{ fontSize: '12px', marginBottom: '10px' }}>縁の色</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {PRESET_COLORS.map(c => <button key={c} onClick={() => updateActive('outlineColor', c)} style={{ background: c, border: currentScript.outlineColor === c ? '3px solid #f97316' : 'none', width: '40px', height: '40px', borderRadius: '10px' }} />)}
            </div>
            <button onClick={() => setShowColorPicker(false)} style={{ width: '100%', marginTop: '20px', background: '#f97316', border: 'none', padding: '12px', borderRadius: '10px', color: 'white', fontWeight: 'bold' }}>完了</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

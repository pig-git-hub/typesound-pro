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
  const lastTriggeredId = useRef(null);
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
      setSoundBank(prev => [...prev, { id, name: file.name }]);
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
          } catch (e) { console.error("Firebase Sound Error", e); }
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
    if (!videoRef.current || !isPlaying) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    const active = [...scripts].sort((a,b) => a.startTime - b.startTime).reverse().find(s => time >= s.startTime);
    if (active && active.id !== lastTriggeredId.current) {
      lastTriggeredId.current = active.id;
      triggerTyping(active);
    }
  };

  const triggerTyping = (script) => {
    if (typingTimer.current) clearInterval(typingTimer.current);
    let i = 0;
    const fullText = script.text || "";
    setDisplayText("");
    typingTimer.current = setInterval(() => {
      if (i < fullText.length) {
        const char = fullText[i];
        if (char !== undefined) { // ★ undefined対策
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
      lastTriggeredId.current = null;
      setDisplayText("");
      setIsPlaying(true);
      videoRef.current.play();
    }
  };

  const updateActive = (key, val) => {
    setScripts(scripts.map(s => s.id === activeId ? { ...s, [key]: val } : s));
  };

  const currentScript = scripts.find(s => s.id === activeId) || scripts[0];
  const heavyStroke = `2px 2px 0 ${currentScript.outlineColor}, -2px -2px 0 ${currentScript.outlineColor}, 2px -2px 0 ${currentScript.outlineColor}, -2px 2px 0 ${currentScript.outlineColor}, 4px 4px 10px rgba(0,0,0,0.5)`;

  return (
    <div style={{ backgroundColor: '#09090b', minHeight: '100vh', color: '#e4e4e7', padding: '10px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '850px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', background: '#18181b', padding: '10px', borderRadius: '15px', border: '1px solid #27272a' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => setAspectRatio('portrait')} style={{ background: aspectRatio === 'portrait' ? '#f97316' : '#27272a', border: 'none', padding: '6px 10px', borderRadius: '8px', color: 'white', fontSize: '11px', cursor: 'pointer' }}>📱 縦</button>
            <button onClick={() => setAspectRatio('landscape')} style={{ background: aspectRatio === 'landscape' ? '#f97316' : '#27272a', border: 'none', padding: '6px 10px', borderRadius: '8px', color: 'white', fontSize: '11px', cursor: 'pointer' }}>💻 横</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <label style={{ background: '#f97316', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>📂 動画読込<input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && setVideoSrc(URL.createObjectURL(e.target.files[0]))} /></label>
            <label style={{ background: '#3b82f6', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>🎵 音源読込<input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleSoundUpload} /></label>
          </div>
          <select value={selectedSoundId} onChange={(e) => setSelectedSoundId(e.target.value)} style={{ background: '#27272a', color: 'white', border: '1px solid #3f3f46', padding: '5px', borderRadius: '8px', fontSize: '11px' }}>
            <option value="default">予備サイン音</option>
            {soundBank.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </header>

        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative', width: aspectRatio === 'portrait' ? '300px' : '533px', height: aspectRatio === 'portrait' ? '533px' : '300px', background: '#000', borderRadius: '20px', overflow: 'hidden', border: '1px solid #27272a', margin: '0 auto', display: 'flex', alignItems: 'center' }}>
              {videoSrc && <video ref={videoRef} src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(e) => setDuration(e.target.duration)} playsInline />}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 10, pointerEvents: isPlaying ? 'none' : 'auto' }}>
                {!isPlaying ? (
                  <textarea style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: `${currentScript.fontSize}px`, fontWeight: 'bold', textAlign: 'center', color: currentScript.textColor, textShadow: heavyStroke, resize: 'none', fontFamily: 'inherit', lineHeight: '1.2' }} value={currentScript.text} onChange={(e) => updateActive('text', e.target.value)} onFocus={() => currentScript.text.includes("入力") && updateActive('text', "")} />
                ) : (
                  <p style={{ fontSize: `${currentScript.fontSize}px`, fontWeight: 'bold', textAlign: 'center', color: currentScript.textColor, textShadow: heavyStroke, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, lineHeight: '1.2' }}>{displayText}</p>
                )}
              </div>
            </div>

            <div style={{ background: '#18181b', padding: '12px', borderRadius: '20px', border: '1px solid #27272a', width: aspectRatio === 'portrait' ? '300px' : '533px' }}>
              <input type="range" min="0" max={duration || 100} step="0.01" value={currentTime} onChange={(e) => { if(videoRef.current) videoRef.current.currentTime = parseFloat(e.target.value); }} style={{ width: '100%', accentColor: '#f97316', marginBottom: '10px' }} />
              
              {/* ★ レイヤー追加ボタンの復活 */}
              <div style={{ display: 'flex', overflowX: 'auto', gap: '8px', marginBottom: '10px' }}>
                <button onClick={() => {
                  const newId = Date.now().toString();
                  setScripts([...scripts, { id: newId, startTime: currentTime, text: "新しいレイヤー", fontSize: 40, speed: 100, textColor: "#ffffff", outlineColor: "#000000" }]);
                  setActiveId(newId);
                }} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>➕ 追加</button>
                {scripts.map(s => (
                  <button key={s.id} onClick={() => { setActiveId(s.id); if(videoRef.current) videoRef.current.currentTime = s.startTime; }} style={{ background: activeId === s.id ? '#f97316' : '#27272a', border: 'none', padding: '8px 10px', borderRadius: '8px', fontSize: '10px', color: 'white' }}>{s.startTime.toFixed(1)}s</button>
                ))}
              </div>
              
              <button onClick={handleTogglePlay} style={{ width: '100%', background: isPlaying ? '#3f3f46' : '#f97316', border: 'none', padding: '12px', borderRadius: '12px', color: 'white', fontWeight: '900', cursor: 'pointer' }}>{isPlaying ? '⏸ STOP' : '▶️ PLAY'}</button>
            </div>
          </div>

          <div style={{ width: '55px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#18181b', padding: '15px 5px', borderRadius: '15px', border: '1px solid #27272a', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: '7px' }}>VOL</span><input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} style={{ writingMode: 'bt-lr', appearance: 'slider-vertical', width: '4px', height: '60px' }} /></div>
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: '7px' }}>SIZE</span><input type="range" min="10" max="150" value={currentScript.fontSize} onChange={(e) => updateActive('fontSize', parseInt(e.target.value))} style={{ writingMode: 'bt-lr', appearance: 'slider-vertical', width: '4px', height: '60px' }} /></div>
            {/* ★ スピードメーター（SPD）の復活 */}
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: '7px' }}>SPD</span><input type="range" min="20" max="500" step="10" value={currentScript.speed} onChange={(e) => updateActive('speed', parseInt(e.target.value))} style={{ writingMode: 'bt-lr', appearance: 'slider-vertical', width: '4px', height: '60px' }} /></div>
            <button onClick={() => setShowColorPicker(!showColorPicker)} style={{ background: '#27272a', border: 'none', borderRadius: '8px', width: '35px', height: '35px', fontSize: '14px', cursor: 'pointer' }}>🎨</button>
          </div>
        </div>
      </div>

      {showColorPicker && (
        <div style={{ position: 'fixed', bottom: '80px', right: '20px', background: '#18181b', padding: '10px', borderRadius: '12px', border: '1px solid #f97316', zIndex: 100 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxWidth: '100px' }}>
            {PRESET_COLORS.map(c => <button key={c} onClick={() => updateActive('textColor', c)} style={{ background: c, border: currentScript.textColor === c ? '2px solid white' : '1px solid #27272a', width: '18px', height: '18px', borderRadius: '50%', cursor: 'pointer' }} />)}
          </div>
          <div style={{ height: '1px', background: '#27272a', margin: '8px 0' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxWidth: '100px' }}>
            {PRESET_COLORS.map(c => <button key={c} onClick={() => updateActive('outlineColor', c)} style={{ background: c, border: currentScript.outlineColor === c ? '2px solid white' : '1px solid #27272a', width: '18px', height: '18px', borderRadius: '50%', cursor: 'pointer' }} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

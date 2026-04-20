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
  const [loadStatus, setLoadStatus] = useState("準備中..."); // デバッグ用ステータス

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

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'sounds');
    return onSnapshot(q, async (snapshot) => {
      const sounds = [];
      const ctx = await initAudio();
      setLoadStatus("音源ロード中...");

      for (const doc of snapshot.docs) {
        const data = doc.data();
        sounds.push({ id: doc.id, ...data });

        if (!audioBuffersRef.current[doc.id] && data.downloadURL) {
          try {
            // mode: 'cors' を明示
            const resp = await fetch(data.downloadURL, { mode: 'cors' });
            const arrayBuffer = await resp.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            audioBuffersRef.current[doc.id] = audioBuffer;
          } catch (e) {
            console.error("Audio Load Error:", e);
            setLoadStatus("音源エラー（CORSの可能性）");
          }
        }
      }
      setSoundBank(sounds);
      setLoadStatus("準備完了");
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
        osc.type = 'sine'; // 耳に優しい音に変更
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.connect(g);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) { console.error(e); }
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
        setDisplayText((prev) => prev + fullText[i]);
        if (fullText[i] !== " " && fullText[i] !== "\n") playSound();
        i++;
      } else { clearInterval(typingTimer.current); }
    }, script.speed);
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

  const currentScript = scripts.find(s => s.id === activeId) || scripts[0];
  const heavyStroke = `2px 2px 0 ${currentScript.outlineColor}, -2px -2px 0 ${currentScript.outlineColor}, 2px -2px 0 ${currentScript.outlineColor}, -2px 2px 0 ${currentScript.outlineColor}, 4px 4px 10px rgba(0,0,0,0.5)`;

  return (
    <div style={{ backgroundColor: '#09090b', minHeight: '100vh', color: '#e4e4e7', padding: '15px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', background: '#18181b', padding: '10px 15px', borderRadius: '15px', border: '1px solid #27272a' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setAspectRatio('portrait')} style={{ background: aspectRatio === 'portrait' ? '#f97316' : '#18181b', border: '1px solid #27272a', padding: '6px 12px', borderRadius: '8px', color: 'white', fontSize: '11px', cursor: 'pointer' }}>📱 縦</button>
            <button onClick={() => setAspectRatio('landscape')} style={{ background: aspectRatio === 'landscape' ? '#f97316' : '#18181b', border: '1px solid #27272a', padding: '6px 12px', borderRadius: '8px', color: 'white', fontSize: '11px', cursor: 'pointer' }}>💻 横</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <select value={selectedSoundId} onChange={(e) => setSelectedSoundId(e.target.value)} style={{ background: '#27272a', color: 'white', border: '1px solid #3f3f46', padding: '5px 10px', borderRadius: '8px', fontSize: '11px' }}>
              <option value="default">予備サイン音</option>
              {soundBank.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span style={{ fontSize: '9px', color: loadStatus.includes('エラー') ? '#ef4444' : '#10b981' }}>{loadStatus}</span>
          </div>

          <label style={{ background: '#f97316', padding: '8px 15px', borderRadius: '10px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>📂 読込<input type="file" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && setVideoSrc(URL.createObjectURL(e.target.files[0]))} /></label>
        </header>

        {/* ...（中略：プレビュー枠や操作パネルは前回と同じ）... */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ position: 'relative', width: aspectRatio === 'portrait' ? '300px' : '533px', height: aspectRatio === 'portrait' ? '533px' : '300px', background: '#000', borderRadius: '20px', overflow: 'hidden', border: '1px solid #27272a', margin: '0 auto', display: 'flex', alignItems: 'center' }}>
              {videoSrc && <video ref={videoRef} key={videoSrc} src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(e) => setDuration(e.target.duration)} playsInline />}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 10, pointerEvents: isPlaying ? 'none' : 'auto' }}>
                {!isPlaying ? (
                  <textarea 
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: `${currentScript.fontSize}px`, fontWeight: 'bold', textAlign: 'center', color: currentScript.textColor, textShadow: heavyStroke, resize: 'none', fontFamily: 'inherit', lineHeight: '1.2' }} 
                    value={currentScript.text} 
                    onChange={(e) => setScripts(scripts.map(s => s.id === activeId ? { ...s, text: e.target.value } : s))} 
                    onFocus={() => currentScript.text.includes("入力") && setScripts(scripts.map(s => s.id === activeId ? { ...s, text: "" } : s))}
                  />
                ) : (
                  <p style={{ fontSize: `${currentScript.fontSize}px`, fontWeight: 'bold', textAlign: 'center', color: currentScript.textColor, textShadow: heavyStroke, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, lineHeight: '1.2' }}>{displayText}</p>
                )}
              </div>
            </div>
            <div style={{ background: '#18181b', padding: '15px', borderRadius: '20px', border: '1px solid #27272a', width: aspectRatio === 'portrait' ? '300px' : '533px' }}>
              <input type="range" min="0" max={duration || 100} step="0.01" value={currentTime} onChange={(e) => { if(videoRef.current) { videoRef.current.currentTime = parseFloat(e.target.value); lastTriggeredId.current = null; setDisplayText(""); } }} style={{ width: '100%', accentColor: '#f97316', marginBottom: '10px' }} />
              <div style={{ display: 'flex', overflowX: 'auto', gap: '8px', marginBottom: '15px' }}>
                <button onClick={() => {
                  const newId = Date.now().toString();
                  setScripts([...scripts, { id: newId, startTime: currentTime, text: "新しい文字", fontSize: 40, speed: 100, textColor: "#ffffff", outlineColor: "#000000" }]);
                  setActiveId(newId);
                }} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>➕ 追加</button>
                {scripts.map(s => (
                  <button key={s.id} onClick={() => { setActiveId(s.id); videoRef.current.currentTime = s.startTime; lastTriggeredId.current = null; setDisplayText(""); }} style={{ background: activeId === s.id ? '#f97316' : '#18181b', border: activeId === s.id ? '2px solid white' : '1px solid #27272a', padding: '8px 10px', borderRadius: '10px', fontSize: '10px', color: 'white', whiteSpace: 'nowrap' }}>{s.startTime.toFixed(1)}s</button>
                ))}
              </div>
              <button onClick={handleTogglePlay} style={{ width: '100%', background: isPlaying ? '#3f3f46' : '#f97316', border: 'none', padding: '15px', borderRadius: '15px', color: 'white', fontWeight: '900', fontSize: '15px', cursor: 'pointer' }}>{isPlaying ? '⏸ STOP' : '▶️ PLAY'}</button>
            </div>
          </div>
          <div style={{ width: '60px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#18181b', padding: '20px 5px', borderRadius: '20px', border: '1px solid #27272a', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: '8px', color: '#10b981', display: 'block' }}>VOL</span><input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} style={{ writingMode: 'bt-lr', appearance: 'slider-vertical', width: '6px', height: '80px' }} /></div>
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: '8px', color: '#f97316', display: 'block' }}>SIZE</span><input type="range" min="10" max="150" value={currentScript.fontSize} onChange={(e) => setScripts(scripts.map(s => s.id === activeId ? { ...s, fontSize: parseInt(e.target.value) } : s))} style={{ writingMode: 'bt-lr', appearance: 'slider-vertical', width: '6px', height: '80px' }} /></div>
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: '8px', color: '#3b82f6', display: 'block' }}>SPD</span><input type="range" min="20" max="500" step="10" value={currentScript.speed} onChange={(e) => setScripts(scripts.map(s => s.id === activeId ? { ...s, speed: parseInt(e.target.value) } : s))} style={{ writingMode: 'bt-lr', appearance: 'slider-vertical', width: '6px', height: '80px' }} /></div>
            <button onClick={() => setShowColorPicker(!showColorPicker)} style={{ background: showColorPicker ? '#f97316' : '#27272a', border: 'none', borderRadius: '10px', width: '40px', height: '40px', fontSize: '16px' }}>🎨</button>
          </div>
        </div>
      </div>
      {showColorPicker && (
        <div style={{ position: 'fixed', bottom: '100px', right: '100px', background: '#18181b', padding: '15px', borderRadius: '15px', border: '1px solid #f97316', zIndex: 100 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '120px' }}>
            {PRESET_COLORS.map(c => <button key={c} onClick={() => setScripts(scripts.map(s => s.id === activeId ? { ...s, textColor: c } : s))} style={{ background: c, border: currentScript.textColor === c ? '2px solid white' : '1px solid #27272a', width: '20px', height: '20px', borderRadius: '50%' }} />)}
          </div>
          <div style={{ height: '1px', background: '#27272a', margin: '8px 0' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '120px' }}>
            {PRESET_COLORS.map(c => <button key={c} onClick={() => setScripts(scripts.map(s => s.id === activeId ? { ...s, outlineColor: c } : s))} style={{ background: c, border: currentScript.outlineColor === c ? '2px solid white' : '1px solid #27272a', width: '20px', height: '20px', borderRadius: '50%' }} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

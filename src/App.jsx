import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// === デザイン（Tailwind CSS）の自動読み込み ===
// これを入れることで、Vercel環境でも自動的に黒ベースの綺麗なデザインが適用されます
if (typeof document !== 'undefined' && !document.getElementById('tailwind-cdn')) {
  const script = document.createElement('script');
  script.id = 'tailwind-cdn';
  script.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(script);
}

const PRESET_COLORS = ['#ffffff', '#ff0000', '#22c55e', '#3b82f6', '#eab308', '#ec4899', '#06b6d4', '#f97316', '#71717a', '#000000'];

// ★変更点：ファイル名を半角英数字にし、読み込みパスを「/」始まりで確実にしました
const DEFAULT_SOUNDS = [
  { id: 'default', name: '💻 標準タイピング音 (電子音)', url: null },
  { id: 'default-enter', name: '⌨️ 標準エンター音 (電子音)', url: null },
  { id: 'mechanical', name: '⌨️ メカニカル', url: '/mechanical.mp3' },
  { id: 'pantograph', name: '⌨️ パンタグラフ', url: '/pantograph.mp3' }
];

const initialScript = [{ id: '1', startTime: 0, text: "タップして入力", fontSize: 40, speed: 100, textColor: "#ffffff", outlineColor: "#000000" }];

const App = () => {
  // === State ===
  const [videoSrc, setVideoSrc] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [aspectRatio, setAspectRatio] = useState('portrait');
  const [volume, setVolume] = useState(0.5);
  
  const [scripts, setScripts] = useState(initialScript);
  const [activeId, setActiveId] = useState('1');
  
  const [soundBank, setSoundBank] = useState([]);
  const [selectedSoundId, setSelectedSoundId] = useState('default');
  const [selectedEnterSoundId, setSelectedEnterSoundId] = useState('default-enter'); // 改行音用のState
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [scriptToDelete, setScriptToDelete] = useState(null);

  // Undo / Redo 用のState
  const [history, setHistory] = useState([initialScript]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isUndoRedo, setIsUndoRedo] = useState(false);

  // === Refs ===
  const videoRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioBuffersRef = useRef({});
  const prevCharCountsRef = useRef({});
  
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const scriptsRef = useRef(scripts);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { scriptsRef.current = scripts; }, [scripts]);

  // === Audio Setup ===
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  // 通常音とエンター音、両方のデフォルト音源を読み込む
  useEffect(() => {
    const loadSound = async (id) => {
      const sound = DEFAULT_SOUNDS.find(s => s.id === id);
      if (sound && sound.url && !audioBuffersRef.current[sound.id]) {
        try {
          const ctx = initAudio();
          const response = await fetch(sound.url);
          if (!response.ok) throw new Error("音源ファイルが見つかりません");
          const arrayBuffer = await response.arrayBuffer();
          audioBuffersRef.current[sound.id] = await ctx.decodeAudioData(arrayBuffer);
        } catch (error) {
          console.warn(`音源(${id})の読み込みに失敗しました。`, error);
        }
      }
    };
    loadSound(selectedSoundId);
    loadSound(selectedEnterSoundId);
  }, [selectedSoundId, selectedEnterSoundId]);

  const handleSoundUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ctx = initAudio();
    const arrayBuffer = await file.arrayBuffer();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const id = `local-${Date.now()}`;
      audioBuffersRef.current[id] = audioBuffer;
      setSoundBank(prev => [{ id, name: `🎵 ${file.name}` }, ...prev]);
      
      // アップロードした時は、とりあえず両方に設定する
      setSelectedSoundId(id);
      setSelectedEnterSoundId(id);
    } catch (err) { 
      alert("音源の読み込みに失敗しました。"); 
    }
  };

  // 音を鳴らす処理（typeで通常かエンターかを判定）
  const playSound = useCallback((type = 'normal') => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      
      const soundId = type === 'enter' ? selectedEnterSoundId : selectedSoundId;
      if (soundId === 'none') return; // 「なし」の場合は鳴らさない

      const gainNode = ctx.createGain();
      // エンター音は通常より少しだけ音量を大きくして打鍵感を出す
      const currentVolume = type === 'enter' ? volume * 0.4 : volume * 0.3;
      gainNode.gain.setValueAtTime(currentVolume, ctx.currentTime);
      gainNode.connect(ctx.destination);

      if (soundId !== 'default' && soundId !== 'default-enter' && audioBuffersRef.current[soundId]) {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffersRef.current[soundId];
        
        // ★隠し味: 同じ音源でも、エンター音の時はピッチを少し下げて「重い音（ターン！）」にする
        if (type === 'enter') {
          source.playbackRate.value = 0.85; 
        }
        
        source.connect(gainNode);
        source.start();
      } else {
        // デフォルトの電子音（ピコピコ音）
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        
        if (soundId === 'default-enter') {
          // エンター用の電子音：少し低くて重い
          osc.frequency.setValueAtTime(300, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
          gainNode.gain.setValueAtTime(currentVolume, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          osc.connect(gainNode);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } else {
          // 通常の電子音
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);
          gainNode.gain.setValueAtTime(currentVolume, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
          osc.connect(gainNode);
          osc.start();
          osc.stop(ctx.currentTime + 0.05);
        }
      }
    } catch (e) {
      console.error("Audio playback error", e);
    }
  }, [selectedSoundId, selectedEnterSoundId, volume]);

  // === 計算された総再生時間 ===
  const [videoDuration, setVideoDuration] = useState(0);
  const calculatedDuration = useMemo(() => {
    let maxScriptTime = 5;
    scripts.forEach(s => {
      const endTime = s.startTime + (s.text.length * (s.speed / 1000));
      if (endTime > maxScriptTime) maxScriptTime = endTime;
    });
    const finalDuration = videoSrc && videoDuration > 0 ? videoDuration : Math.ceil(maxScriptTime + 1);
    return Math.max(finalDuration, 1);
  }, [scripts, videoSrc, videoDuration]);

  // === 同期アニメーションループ ===
  useEffect(() => {
    let animationFrameId;
    let lastTime = performance.now();

    const loop = (timestamp) => {
      if (isPlayingRef.current) {
        let newCurrentTime = currentTimeRef.current;

        if (videoRef.current && videoSrc) {
          newCurrentTime = videoRef.current.currentTime;
        } else {
          const delta = (timestamp - lastTime) / 1000;
          newCurrentTime += delta;
        }

        if (newCurrentTime >= calculatedDuration) {
          setIsPlaying(false);
          newCurrentTime = calculatedDuration;
          if (videoRef.current) videoRef.current.pause();
        }

        setCurrentTime(newCurrentTime);

        const sortedScriptsForAudio = [...scriptsRef.current].sort((a,b) => a.startTime - b.startTime);
        sortedScriptsForAudio.forEach((script, index) => {
          const nextScript = sortedScriptsForAudio[index + 1];
          const endTime = nextScript ? nextScript.startTime : Infinity;

          if (newCurrentTime >= script.startTime && newCurrentTime < endTime) {
            const elapsed = newCurrentTime - script.startTime;
            const speedSec = script.speed / 1000;
            const expectedChars = Math.floor(elapsed / speedSec);
            const actualChars = Math.min(expectedChars, script.text.length);
            
            const prevChars = prevCharCountsRef.current[script.id] || 0;
            
            if (actualChars > prevChars) {
              const newString = script.text.substring(prevChars, actualChars);
              
              // 改行（Enter）が含まれているかチェック
              if (newString.includes('\n')) {
                playSound('enter');
              }
              // スペース・改行以外の普通の文字が含まれているかチェック
              if (newString.replace(/[\s\n]/g, '').length > 0) {
                playSound('normal');
              }
            }
            prevCharCountsRef.current[script.id] = actualChars;
          } else if (newCurrentTime < script.startTime) {
            prevCharCountsRef.current[script.id] = 0;
          } else if (newCurrentTime >= endTime) {
            prevCharCountsRef.current[script.id] = script.text.length;
          }
        });
      }
      
      lastTime = timestamp;
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [calculatedDuration, videoSrc, playSound]);

  // === 履歴の自動保存 ===
  useEffect(() => {
    if (isUndoRedo) {
      setIsUndoRedo(false);
      return;
    }
    const timer = setTimeout(() => {
      setHistory(prev => {
        const currentHistory = prev.slice(0, historyIndex + 1);
        if (JSON.stringify(currentHistory[currentHistory.length - 1]) === JSON.stringify(scripts)) {
          return prev;
        }
        const newHistory = [...currentHistory, scripts];
        if (newHistory.length > 30) newHistory.shift();
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [scripts, historyIndex, isUndoRedo]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      setIsUndoRedo(true);
      const prevIndex = historyIndex - 1;
      const prevScripts = history[prevIndex];
      setHistoryIndex(prevIndex);
      setScripts(prevScripts);
      if (!prevScripts.find(s => s.id === activeId)) setActiveId(prevScripts[0].id);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setIsUndoRedo(true);
      const nextIndex = historyIndex + 1;
      const nextScripts = history[nextIndex];
      setHistoryIndex(nextIndex);
      setScripts(nextScripts);
      if (!nextScripts.find(s => s.id === activeId)) setActiveId(nextScripts[0].id);
    }
  };

  // === Controls ===
  const handleSeek = (time) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    const sortedScriptsForSeek = [...scripts].sort((a,b) => a.startTime - b.startTime);
    sortedScriptsForSeek.forEach((script, index) => {
      const nextScript = sortedScriptsForSeek[index + 1];
      const endTime = nextScript ? nextScript.startTime : Infinity;

      if (time >= script.startTime && time < endTime) {
        const elapsed = time - script.startTime;
        const expectedChars = Math.floor(elapsed / (script.speed / 1000));
        prevCharCountsRef.current[script.id] = Math.min(expectedChars, script.text.length);
      } else if (time < script.startTime) {
        prevCharCountsRef.current[script.id] = 0;
      } else {
        prevCharCountsRef.current[script.id] = script.text.length;
      }
    });
  };

  const handleTogglePlay = () => {
    initAudio(); 
    if (isPlaying) {
      if (videoRef.current) videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (currentTime >= calculatedDuration) {
        handleSeek(0);
      }
      if (videoRef.current && videoSrc) {
        videoRef.current.play();
      }
      setIsPlaying(true);
    }
  };

  const updateActive = (key, val) => {
    setScripts(scripts.map(s => s.id === activeId ? { ...s, [key]: val } : s));
  };

  const deleteScript = (id) => {
    if (scripts.length <= 1) return;
    setScriptToDelete(id);
  };

  const confirmDelete = () => {
    if (!scriptToDelete) return;
    const nextScripts = scripts.filter(s => s.id !== scriptToDelete);
    setScripts(nextScripts);
    setActiveId(nextScripts[0].id);
    setScriptToDelete(null);
  };

  const addScript = () => {
    const newId = Date.now().toString();
    setScripts([...scripts, { 
      id: newId, startTime: currentTime, text: "新規字幕\n改行テスト", 
      fontSize: 40, speed: 100, textColor: "#ffffff", outlineColor: "#000000" 
    }]);
    setActiveId(newId);
  };

  const currentScript = scripts.find(s => s.id === activeId) || scripts[0];

  const Slider = ({ label, icon, value, min, max, step, onChange }) => (
    <div className="bg-zinc-800 p-3 rounded-xl mb-3">
      <div className="flex justify-between text-xs text-zinc-400 mb-2 font-medium">
        <span className="flex items-center gap-1">{icon} {label}</span>
        <span className="text-orange-500">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} 
             onChange={(e) => onChange(parseFloat(e.target.value))} 
             className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans pb-32">
      <div className="max-w-xl mx-auto p-4">
        
        <header className="flex justify-between items-center mb-4 gap-2">
          <div className="flex gap-2">
            <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg">
              <button onClick={() => setAspectRatio('portrait')} className={`p-2 rounded-md transition ${aspectRatio === 'portrait' ? 'bg-zinc-800 text-orange-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
                📱
              </button>
              <button onClick={() => setAspectRatio('landscape')} className={`p-2 rounded-md transition ${aspectRatio === 'landscape' ? 'bg-zinc-800 text-orange-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
                💻
              </button>
            </div>
            
            <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg">
              <button onClick={handleUndo} disabled={historyIndex === 0} className={`p-2 rounded-md transition ${historyIndex === 0 ? 'text-zinc-700 cursor-not-allowed opacity-50' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}>
                ↩️
              </button>
              <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={`p-2 rounded-md transition ${historyIndex >= history.length - 1 ? 'text-zinc-700 cursor-not-allowed opacity-50' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}>
                ↪️
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <label className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 transition px-3 py-2 rounded-lg text-xs font-bold cursor-pointer">
              🎥 動画選択
              <input type="file" accept="video/*" className="hidden" 
                     onChange={(e) => e.target.files[0] && setVideoSrc(URL.createObjectURL(e.target.files[0]))} />
            </label>
            <label className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 transition px-3 py-2 rounded-lg text-xs font-bold cursor-pointer">
              🎵 音源追加
              <input type="file" accept="audio/*" className="hidden" onChange={handleSoundUpload} />
            </label>
          </div>
        </header>

        <div className="flex items-start gap-3 mb-6 w-full">
          <div className="flex-1 relative bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center" 
               style={{ aspectRatio: aspectRatio === 'portrait' ? '9/16' : '16/9' }}>
            
            {videoSrc ? (
              <video ref={videoRef} src={videoSrc} className="w-full h-full object-contain" 
                     onLoadedMetadata={(e) => setVideoDuration(e.target.duration)} playsInline />
            ) : (
              <div className="text-zinc-700 text-sm flex flex-col items-center gap-2">
                <span className="text-3xl">🎥</span>
                <p>動画なし（プレビューのみ）</p>
              </div>
            )}

            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-30 bg-zinc-950/80 backdrop-blur-md p-2 rounded-full border border-zinc-800 shadow-xl"
                 onClick={(e) => e.stopPropagation()}>
              <span className="text-zinc-400 text-xs">🅰️</span>
              <div className="relative w-6 h-28">
                <input type="range" min="10" max="150" value={currentScript.fontSize}
                       onChange={(e) => updateActive('fontSize', parseInt(e.target.value))}
                       className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-orange-500 origin-center -rotate-90" />
              </div>
              <span className="text-orange-500 text-[10px] font-bold">{currentScript.fontSize}</span>
            </div>

            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-30 bg-zinc-950/80 backdrop-blur-md p-2 rounded-full border border-zinc-800 shadow-xl"
                 onClick={(e) => e.stopPropagation()}>
              <span className="text-zinc-400 text-xs">⚡</span>
              <div className="relative w-6 h-28">
                <input type="range" min="20" max="500" step="10" value={520 - currentScript.speed}
                       onChange={(e) => updateActive('speed', 520 - parseInt(e.target.value))}
                       className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-orange-500 origin-center -rotate-90" />
              </div>
              <span className="text-orange-500 text-[10px] font-bold">{currentScript.speed}</span>
            </div>

            <div className={`absolute inset-0 px-16 py-6 grid place-items-center ${isPlaying ? 'pointer-events-none' : 'pointer-events-auto'}`}>
              {[...scripts].sort((a,b) => a.startTime - b.startTime).map((s, index, sortedScripts) => {
                const nextScript = sortedScripts[index + 1];
                const endTime = nextScript ? nextScript.startTime : Infinity;

                const isActive = s.id === activeId;
                const isWithinTime = currentTime >= s.startTime && currentTime < endTime;

                let visibleText = "";
                let shouldShow = false;

                if (isPlaying) {
                  if (isWithinTime) {
                    shouldShow = true;
                    const charCount = Math.floor((currentTime - s.startTime) / (s.speed / 1000));
                    visibleText = s.text.substring(0, charCount);
                  }
                } else {
                  if (isActive) {
                    shouldShow = true;
                    visibleText = s.text;
                  } else if (isWithinTime) {
                    shouldShow = true;
                    const charCount = Math.floor((currentTime - s.startTime) / (s.speed / 1000));
                    visibleText = s.text.substring(0, charCount);
                  }
                }

                if (!shouldShow) return null;

                const stroke = `2px 2px 0 ${s.outlineColor}, -2px -2px 0 ${s.outlineColor}, 2px -2px 0 ${s.outlineColor}, -2px 2px 0 ${s.outlineColor}, 4px 4px 15px rgba(0,0,0,0.8)`;

                const textStyle = {
                  fontSize: `${s.fontSize}px`,
                  color: s.textColor,
                  textShadow: stroke,
                  fontWeight: '900',
                  lineHeight: '1.2',
                  zIndex: isActive ? 20 : 10,
                  opacity: 1,
                  gridArea: '1 / 1',
                };

                if (!isPlaying && isActive) {
                  return (
                    <textarea
                      key={s.id}
                      ref={el => {
                        if (el) {
                          el.style.height = 'auto';
                          el.style.height = el.scrollHeight + 'px';
                        }
                      }}
                      value={s.text}
                      onChange={(e) => updateActive('text', e.target.value)}
                      onFocus={() => {
                        if (s.text === "タップして入力" || s.text === "新規字幕\n改行テスト") {
                          updateActive('text', "");
                        }
                      }}
                      className="w-full text-center bg-transparent border-none outline-none resize-none overflow-hidden placeholder-white/30"
                      style={{ ...textStyle, minHeight: '1em' }}
                      rows={1}
                      placeholder="タップして入力"
                    />
                  );
                }

                return (
                  <div key={s.id} className="w-full text-center whitespace-pre-wrap break-all transition-opacity duration-200"
                       style={textStyle}>
                    {visibleText || (isActive && !isPlaying ? <span className="opacity-50">文字を入力</span> : "")}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="w-[64px] flex-shrink-0 flex flex-col gap-2">
            <button onClick={addScript} className="w-full aspect-square bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-bold transition flex flex-col items-center justify-center gap-1 shadow-lg">
              <span className="text-lg">➕</span>
              <span className="leading-none">追加</span>
            </button>
            
            <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar" 
                 style={{ maxHeight: aspectRatio === 'portrait' ? '55vh' : '25vh' }}>
              {[...scripts].sort((a,b) => a.startTime - b.startTime).map((s, index) => (
                <button key={s.id} onClick={() => { setActiveId(s.id); handleSeek(s.startTime); }} 
                        className={`w-full aspect-square flex-shrink-0 flex flex-col items-center justify-center rounded-2xl text-[10px] font-bold transition border ${activeId === s.id ? 'bg-orange-600 border-orange-400 text-white shadow-lg scale-105' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}>
                  <span className="text-[9px] opacity-70 mb-1">L.{index + 1}</span>
                  <span className="leading-none">{s.startTime.toFixed(1)}s</span>
                </button>
              ))}
            </div>

            <button onClick={() => deleteScript(activeId)} className="w-full aspect-square bg-red-950/50 hover:bg-red-900 border border-red-900/50 text-red-500 hover:text-white rounded-2xl text-[10px] font-bold transition flex flex-col items-center justify-center gap-1 shadow-lg mt-auto">
              <span className="text-lg">🗑️</span>
              <span className="leading-none">削除</span>
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 p-4 rounded-2xl mb-4 border border-zinc-800">
          <div className="flex justify-between text-xs text-zinc-400 font-mono mb-2">
            <span className="text-orange-500 font-bold">{currentTime.toFixed(2)}s</span>
            <span>{calculatedDuration.toFixed(2)}s</span>
          </div>
          <input type="range" min="0" max={calculatedDuration} step="0.01" value={currentTime} 
                 onChange={(e) => handleSeek(parseFloat(e.target.value))} 
                 className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500" />
        </div>

        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2 text-xs font-bold text-zinc-400">
              <span className="flex items-center gap-1">📝 テキスト編集</span>
            </div>
            <textarea 
              ref={el => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }
              }}
              value={currentScript.text}
              onChange={(e) => updateActive('text', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white resize-none focus:outline-none focus:border-orange-500 transition overflow-y-auto custom-scrollbar"
              rows={3} 
              placeholder="ここに入力した文字がタイピングされます"
            />
          </div>

          {/* 音源選択（通常音と改行音を分割） */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <div className="text-[10px] font-bold text-zinc-400 mb-1 flex items-center gap-1">📝 通常音</div>
              <select value={selectedSoundId} onChange={(e) => setSelectedSoundId(e.target.value)} 
                      className="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-500 transition">
                <optgroup label="デフォルト音源">
                  {DEFAULT_SOUNDS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
                {soundBank.length > 0 && (
                  <optgroup label="自分で追加した音源">
                    {soundBank.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            
            <div className="flex-1">
              <div className="text-[10px] font-bold text-zinc-400 mb-1 flex items-center gap-1">⏎ 改行 (Enter) 音</div>
              <select value={selectedEnterSoundId} onChange={(e) => setSelectedEnterSoundId(e.target.value)} 
                      className="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-500 transition">
                <option value="none">🔇 なし (鳴らさない)</option>
                <optgroup label="デフォルト音源">
                  {DEFAULT_SOUNDS.map(s => <option key={`enter-${s.id}`} value={s.id}>{s.name}</option>)}
                </optgroup>
                {soundBank.length > 0 && (
                  <optgroup label="自分で追加した音源">
                    {soundBank.map(s => <option key={`enter-${s.id}`} value={s.id}>{s.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <Slider label="音量" icon="🔊" min={0} max={1} step={0.1} value={volume} onChange={setVolume} />

          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowColorPicker(true)} className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl py-3 text-sm font-bold transition">
              🎨 色・縁取り設定
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent z-50">
        <button onClick={handleTogglePlay} className={`w-full max-w-xl mx-auto flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-lg shadow-xl transition-all ${isPlaying ? 'bg-zinc-800 text-white border border-zinc-700' : 'bg-orange-600 text-white hover:bg-orange-500'}`}>
          {isPlaying ? <>⏸️ 停止</> : <>▶️ プレビュー再生</>}
        </button>
      </div>

      {showColorPicker && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowColorPicker(false)}>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">🎨 文字色</h3>
            <div className="flex flex-wrap gap-2 mb-6">
              {PRESET_COLORS.map(c => (
                <button key={`text-${c}`} onClick={() => updateActive('textColor', c)} 
                        className={`w-10 h-10 rounded-full transition-transform ${currentScript.textColor === c ? 'scale-110 ring-4 ring-orange-500 ring-offset-2 ring-offset-zinc-900' : ''}`}
                        style={{ backgroundColor: c }} />
              ))}
            </div>
            
            <h3 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">🎨 縁の色</h3>
            <div className="flex flex-wrap gap-2 mb-6">
              {PRESET_COLORS.map(c => (
                <button key={`outline-${c}`} onClick={() => updateActive('outlineColor', c)} 
                        className={`w-10 h-10 rounded-full transition-transform ${currentScript.outlineColor === c ? 'scale-110 ring-4 ring-orange-500 ring-offset-2 ring-offset-zinc-900' : ''}`}
                        style={{ backgroundColor: c }} />
              ))}
            </div>
            
            <button onClick={() => setShowColorPicker(false)} className="w-full bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition">
              完了
            </button>
          </div>
        </div>
      )}

      {scriptToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setScriptToDelete(null)}>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-2 text-red-500">
              <span className="text-2xl">🗑️</span>
              <h3 className="text-lg font-bold">レイヤーを削除しますか？</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6 ml-9">削除したレイヤーは、上の「元に戻す」ボタンから復元することも可能です。</p>
            <div className="flex gap-3">
              <button onClick={() => setScriptToDelete(null)} className="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition">
                キャンセル
              </button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-500 transition shadow-lg shadow-red-900/50">
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

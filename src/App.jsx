import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  Camera, 
  Volume2, 
  VolumeX, 
  Activity, 
  Sun, 
  Cpu, 
  Play, 
  Square,
  RefreshCw,
  Lightbulb
} from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [0, 9], [9, 10], [10, 11], [11, 12], // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [5, 9], [9, 13], [13, 17] // Palm
];

const PHRASES = [
  "Здравствуйте", 
  "Мне нужна помощь", 
  "Меня зовут Саша", 
  "Жестовый язык", 
  "Спасибо", 
  "Пожалуйста",
  "Как дела?",
  "Всё хорошо",
  "Где выход?"
];

function App() {
  const [landmarker, setLandmarker] = useState(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [transcription, setTranscription] = useState("ОЖИДАНИЕ ЖЕСТА...");
  const [autoVoice, setAutoVoice] = useState(true);
  const [lightLevel, setLightLevel] = useState(0);
  const [smartLightIntensity, setSmartLightIntensity] = useState(0);
  const [fps, setFps] = useState(0);
  const [isModelLoading, setIsModelLoading] = useState(true);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lightCanvasRef = useRef(null);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);

  // Load MediaPipe Model
  useEffect(() => {
    const initModel = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const result = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
        setLandmarker(result);
        setIsModelLoading(false);
      } catch (error) {
        console.error("Failed to load HandLandmarker:", error);
      }
    };
    initModel();
  }, []);

  // Text-to-Speech
  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (autoVoice && transcription !== "ОЖИДАНИЕ ЖЕСТА..." && transcription !== "") {
      speak(transcription);
    }
  }, [transcription, autoVoice]);

  const startSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720, facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', () => {
          setIsSessionActive(true);
        });
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Не удалось получить доступ к камере.");
    }
  };

  const stopSession = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsSessionActive(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    setTranscription("ОЖИДАНИЕ ЖЕСТА...");
  };

  const analyzeLight = () => {
    if (!videoRef.current || !lightCanvasRef.current) return;
    const canvas = lightCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Draw small frame for analysis
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let brightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      brightness += (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
    }
    
    const avg = brightness / (data.length / 4);
    setLightLevel(Math.round(avg));
    
    // Smooth transition for Smart Light
    const target = avg < 100 ? Math.min(100, (100 - avg) * 1.5) : 0;
    setSmartLightIntensity(prev => prev + (target - prev) * 0.1);
  };

  const processFrame = () => {
    if (!videoRef.current || !canvasRef.current || !landmarker) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      
      const startTimeMs = performance.now();
      const results = landmarker.detectForVideo(video, startTimeMs);

      // FPS Logic
      frameCountRef.current++;
      if (startTimeMs - lastFpsUpdateRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = startTimeMs;
        analyzeLight();
      }

      // Drawing
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Mirroring
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      if (results.landmarks) {
        for (const landmarks of results.landmarks) {
          // Draw connections (Gold)
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          HAND_CONNECTIONS.forEach(([start, end]) => {
            const startPt = landmarks[start];
            const endPt = landmarks[end];
            ctx.beginPath();
            ctx.moveTo(startPt.x * canvas.width, startPt.y * canvas.height);
            ctx.lineTo(endPt.x * canvas.width, endPt.y * canvas.height);
            ctx.stroke();
          });

          // Draw joints (Green)
          ctx.fillStyle = '#00FF41';
          landmarks.forEach(pt => {
            ctx.beginPath();
            ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 5, 0, 2 * Math.PI);
            ctx.fill();
          });
        }

        // Simulation
        if (results.landmarks.length > 0 && Math.random() < 0.05) {
          const randomPhrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
          setTranscription(randomPhrase);
        }
      }
      ctx.restore();
    }
    requestRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    if (isSessionActive) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isSessionActive, landmarker]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="scanline" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,215,0,0.05),transparent)] pointer-events-none" />

      {/* Smart Light Overlay */}
      <div 
        className="fixed inset-0 pointer-events-none transition-opacity duration-500 z-40"
        style={{ 
          opacity: smartLightIntensity > 10 ? smartLightIntensity / 100 : 0,
          border: '24px solid white',
          background: 'radial-gradient(circle, transparent 40%, rgba(255,255,255,0.2) 100%)',
          boxShadow: 'inset 0 0 100px white'
        }}
      />

      {/* Header */}
      <header className="w-full max-w-5xl flex items-center justify-between mb-8 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyber-yellow text-cyber-black rounded-lg glow-yellow animate-pulse">
            <Zap size={24} fill="currentColor" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tighter font-cyber italic">
            SIGN<span className="text-white">LIGHT</span>
          </h1>
          <div className="hidden md:block">
            <span className="cyber-badge">ON-DEVICE ML</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-cyber-green" />
            <span className="text-white/60">PIPELINE:</span>
            <span className="text-cyber-green">{fps} FPS</span>
          </div>
          <div className="flex items-center gap-2">
            <Sun size={14} className="text-cyber-yellow" />
            <span className="text-white/60">LUX:</span>
            <span className="text-cyber-yellow">{lightLevel}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-5xl flex-1 flex flex-col gap-6 z-10">
        {/* Video Block */}
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden cyber-panel shadow-2xl">
          {!isSessionActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-cyber-black/90 z-20">
              <Cpu size={64} className={`mb-4 ${isModelLoading ? 'animate-spin text-cyber-yellow/20' : 'text-cyber-yellow animate-pulse'}`} />
              <p className="font-cyber text-lg tracking-widest text-cyber-yellow/50">
                {isModelLoading ? "ЗАГРУЗКА ML МОДЕЛИ..." : "СИСТЕМА ГОТОВА К ЗАПУСКУ"}
              </p>
            </div>
          )}
          
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
          
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="absolute inset-0 w-full h-full object-cover z-10"
          />

          {/* Video Overlays */}
          {isSessionActive && (
            <>
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 px-3 py-1 rounded-md backdrop-blur-md border border-white/10">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                <span className="text-[10px] font-mono text-white/80">REC • STREAMING</span>
              </div>
              <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-md backdrop-blur-md border border-white/10">
                <span className="text-[10px] font-mono text-cyber-yellow/80">EXPOSURE COMP: {smartLightIntensity.toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>

        {/* Telemetry & Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="cyber-panel p-4 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-white/40 uppercase mb-1">Light Analysis</span>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black font-cyber">{lightLevel} lx</span>
              <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-cyber-yellow transition-all duration-300" style={{ width: `${Math.min(100, (lightLevel/255)*100)}%` }} />
              </div>
            </div>
          </div>
          <div className="cyber-panel p-4 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-white/40 uppercase mb-1">Smart Intensity</span>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black font-cyber">{Math.round(smartLightIntensity)}%</span>
              <Lightbulb size={18} className={smartLightIntensity > 10 ? "text-white animate-pulse" : "text-white/20"} />
            </div>
          </div>
          <div className="cyber-panel p-4 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-white/40 uppercase mb-1">Neural Engine</span>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black font-cyber">GPU</span>
              <span className="text-[10px] bg-cyber-green/20 text-cyber-green px-1">ACTIVE</span>
            </div>
          </div>
          <div className="cyber-panel p-4 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-white/40 uppercase mb-1">Audio Module</span>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black font-cyber">{autoVoice ? "ON" : "OFF"}</span>
              {autoVoice ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </div>
          </div>
        </div>

        {/* Translation Output */}
        <div className="cyber-panel p-6 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-cyber-yellow shadow-[0_0_10px_#FFD700]" />
          <span className="text-[10px] font-bold text-cyber-yellow/60 uppercase tracking-[0.2em] mb-2 block">ПЕРЕВОД (REAL-TIME)</span>
          <div className="flex items-center justify-between gap-4">
            <p className="text-3xl md:text-5xl font-black tracking-tight text-white uppercase glitch-text">
              {transcription}
            </p>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => speak(transcription)}
                className="p-3 bg-cyber-yellow/10 hover:bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/30 rounded-lg transition-colors"
                title="Озвучить"
              >
                <Volume2 size={24} />
              </button>
              <button 
                onClick={() => setAutoVoice(!autoVoice)}
                className={`p-3 border rounded-lg transition-colors ${autoVoice ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}
                title="Авто-озвучка"
              >
                {autoVoice ? <Volume2 size={24} /> : <VolumeX size={24} />}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Hidden Analysis Canvas */}
      <canvas ref={lightCanvasRef} width={64} height={48} className="hidden" />

      {/* Footer Controls */}
      <footer className="w-full max-w-5xl mt-8 flex justify-center z-10">
        {!isSessionActive ? (
          <button 
            onClick={startSession}
            disabled={isModelLoading}
            className="cyber-button text-xl flex items-center gap-4 py-4 px-12 group"
          >
            <Play size={24} className="group-hover:translate-x-1 transition-transform" />
            {isModelLoading ? "ЗАГРУЗКА ML МОДЕЛИ..." : "START SESSION"}
          </button>
        ) : (
          <button 
            onClick={stopSession}
            className="cyber-button border-cyber-red text-cyber-red hover:bg-cyber-red hover:text-white flex items-center gap-4 py-4 px-12"
          >
            <Square size={24} />
            END SESSION
          </button>
        )}
      </footer>
    </div>
  );
}

export default App;

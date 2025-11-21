import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, Download, Copy, Trash2, Zap, ZapOff, SwitchCamera, Aperture } from 'lucide-react';

// --- Types ---
interface Photo {
  id: string;
  dataUrl: string;
  timestamp: number;
}

// --- Constants & Utils ---
const STORAGE_KEY = 'retro-polaroid-photos';
const MAX_STORED_PHOTOS = 50;
const DEVELOP_TIME_MS = 1800; // Speed up to 1.8s (approx 30% faster than 2.5s)

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// Resize image to save space and ensure performance
const processImage = (video: HTMLVideoElement): string => {
  const canvas = document.createElement('canvas');
  const size = 600; // Square aspect ratio for polaroid feel
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return '';

  // Crop to center square
  const minDim = Math.min(video.videoWidth, video.videoHeight);
  const startX = (video.videoWidth - minDim) / 2;
  const startY = (video.videoHeight - minDim) / 2;

  ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, size, size);
  
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = 'rgba(100, 50, 0, 0.1)';
  ctx.fillRect(0,0, size, size);

  return canvas.toDataURL('image/jpeg', 0.7);
};

// Generate a full Polaroid frame canvas (photo + border + text) for export
const generatePolaroidCanvas = async (photo: Photo): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = photo.dataUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const photoSize = 600; 
  const paddingX = 40;
  const paddingTop = 40;
  const paddingBottom = 120;
  
  const width = photoSize + (paddingX * 2);
  const height = photoSize + paddingTop + paddingBottom;

  canvas.width = width;
  canvas.height = height;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Photo
  ctx.drawImage(img, paddingX, paddingTop, photoSize, photoSize);
  
  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  ctx.strokeRect(paddingX, paddingTop, photoSize, photoSize);

  // Gradient overlay
  const gradient = ctx.createLinearGradient(paddingX, paddingTop, paddingX + photoSize, paddingTop + photoSize);
  gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = gradient;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillRect(paddingX, paddingTop, photoSize, photoSize);
  ctx.globalCompositeOperation = 'source-over';

  // Text
  ctx.font = '400 48px "Caveat", cursive';
  ctx.fillStyle = '#4b5563';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const textX = width / 2;
  const textY = paddingTop + photoSize + (paddingBottom / 2) - 5;

  ctx.save();
  ctx.translate(textX, textY);
  ctx.rotate(-0.02);
  ctx.fillText(formatDate(photo.timestamp), 0, 0);
  ctx.restore();

  return canvas;
};

// --- Styles & Animation ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap');

    .font-handwriting {
      font-family: 'Caveat', cursive;
    }

    @keyframes eject {
      0% { transform: translateY(-100%) scale(0.9); opacity: 0; }
      100% { transform: translateY(20px) scale(1); opacity: 1; }
    }

    @keyframes develop {
      0% { filter: brightness(0.1) grayscale(1) blur(2px); }
      40% { filter: brightness(0.8) grayscale(0.5) blur(0.5px); }
      100% { filter: brightness(1) grayscale(0) blur(0); }
    }

    .animate-eject {
      animation: eject 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }

    .animate-develop {
      animation: develop 1.8s ease-out forwards;
    }

    .pattern-grip {
      background-image: radial-gradient(black 15%, transparent 16%), radial-gradient(black 15%, transparent 16%);
      background-size: 4px 4px;
      background-position: 0 0, 2px 2px;
    }
  `}</style>
);

// --- Components ---

interface InstantPhotoProps { 
  photo: Photo; 
  onDelete?: (id: string) => void;
  developing?: boolean;
}

const InstantPhoto: React.FC<InstantPhotoProps> = ({ 
  photo, 
  onDelete, 
  developing = false 
}) => {
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCopy = async () => {
    setIsProcessing(true);
    try {
      const canvas = await generatePolaroidCanvas(photo);
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Canvas blob failed');
        
        try {
          const data = [new ClipboardItem({ [blob.type]: blob })];
          await navigator.clipboard.write(data);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error('Clipboard write failed', err);
          alert('Clipboard access denied or not supported.');
        }
        setIsProcessing(false);
      }, 'image/png');
    } catch (err) {
      console.error('Failed to copy', err);
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    setIsProcessing(true);
    try {
      const canvas = await generatePolaroidCanvas(photo);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `polaroid-${photo.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className={`
        group relative bg-white p-3 pb-10 shadow-lg transition-all duration-300
        ${developing ? 'animate-eject z-20' : 'hover:-translate-y-2 hover:scale-105 hover:rotate-0 hover:shadow-2xl'}
        w-64 flex-shrink-0 select-none
      `}
      style={{
        // Use group-hover for pure CSS z-index handling, cleaner than JS state
        // But developing needs priority
        zIndex: developing ? 20 : undefined,
        transform: !developing ? `rotate(${Math.random() * 2 - 1}deg)` : undefined,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
      }}
    >
      {/* The Photo Area */}
      <div className="aspect-[4/5] bg-gray-900 overflow-hidden relative ring-1 ring-black/10">
        <img 
          src={photo.dataUrl} 
          alt="Instant capture" 
          className={`w-full h-full object-cover ${developing ? 'animate-develop' : ''}`}
        />
        {/* Glossy Overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none mix-blend-overlay" />
        <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] pointer-events-none" />
      </div>

      {/* Handwritten Date */}
      <div className="mt-3 text-center h-6 relative">
        <p className="font-handwriting text-gray-600 text-xl leading-none opacity-90 transform -rotate-1">
          {formatDate(photo.timestamp)}
        </p>
      </div>

      {/* Delete Button - ALWAYS VISIBLE, NO HOVER REQUIRED, HIGH Z-INDEX */}
      {!developing && (
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Deleting photo", photo.id);
            onDelete?.(photo.id);
          }}
          className={`
            absolute -top-2 -right-2 z-[50]
            w-8 h-8 bg-red-500 text-white rounded-full shadow-md 
            flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
            cursor-pointer hover:scale-110 active:scale-95
          `}
          title="Delete photo"
          aria-label="Delete photo"
        >
          <Trash2 size={14} />
        </button>
      )}
      
      {/* Bottom Actions */}
      {!developing && (
         <div className={`
            absolute inset-x-0 bottom-2 flex justify-center gap-3 
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
         `}>
           <div className="flex gap-2">
             <button 
              onClick={handleCopy}
              disabled={isProcessing}
              className="p-1.5 bg-white/90 backdrop-blur rounded-full shadow hover:bg-blue-50 text-gray-700 transition-transform hover:scale-110 border border-gray-200 disabled:opacity-50"
              title="Copy Frame"
            >
              {copied ? <span className="text-xs font-bold text-green-600 px-1">OK</span> : <Copy size={14} />}
            </button>
            <button 
              onClick={handleDownload}
              disabled={isProcessing}
              className="p-1.5 bg-white/90 backdrop-blur rounded-full shadow hover:bg-green-50 text-gray-700 transition-transform hover:scale-110 border border-gray-200 disabled:opacity-50"
              title="Download Frame"
            >
              <Download size={14} />
            </button>
           </div>
         </div>
      )}
    </div>
  );
};

const RetroCamera = ({ onCapture }: { onCapture: (dataUrl: string) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [flash, setFlash] = useState(true);
  const [isFlashing, setIsFlashing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 1280 },
            aspectRatio: 1
          } 
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError('Camera access denied or not available.');
      }
    };
    startCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const takePhoto = () => {
    if (!videoRef.current || printing) return;

    if (flash) {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 100);
    }

    setPrinting(true);

    setTimeout(() => {
      if (videoRef.current) {
        const dataUrl = processImage(videoRef.current);
        onCapture(dataUrl);
        setTimeout(() => setPrinting(false), 800); 
      }
    }, 200);
  };

  return (
    <div className="relative z-10 flex flex-col items-center">
      <div className="relative bg-[#f4f1ea] p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] w-[340px] border-b-8 border-[#dcd9d2]">
        
        <div className="absolute top-8 left-0 w-full h-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-80" />
        
        <div className="flex justify-between items-start mb-4 px-2 relative z-10">
          <div className="flex gap-2">
            <button 
              onClick={() => setFlash(!flash)}
              className={`p-2 rounded-full transition-colors ${flash ? 'text-yellow-500 bg-black' : 'text-gray-400 bg-gray-200'}`}
            >
              {flash ? <Zap size={16} fill="currentColor" /> : <ZapOff size={16} />}
            </button>
          </div>
          <div className="h-4 w-20 bg-black/10 rounded-full" />
        </div>

        <div className="relative mx-auto w-64 h-64 bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-[inset_0_5px_15px_rgba(0,0,0,0.5)] border-4 border-[#2a2a2a]">
          <div className="relative w-56 h-56 rounded-full overflow-hidden border-8 border-[#111] bg-black">
            {error ? (
              <div className="flex items-center justify-center h-full text-white/50 text-xs text-center p-4">
                {error}
              </div>
            ) : (
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover transform scale-x-[-1]" 
              />
            )}
            <div className={`absolute inset-0 bg-white transition-opacity duration-100 pointer-events-none ${isFlashing ? 'opacity-100' : 'opacity-0'}`} />
          </div>

           <div className="absolute top-10 left-10 w-16 h-8 bg-white/5 rounded-full rotate-[-45deg] blur-md pointer-events-none" />
        </div>

        <div className="mt-6 flex justify-between items-center px-4">
          <button 
            onClick={takePhoto}
            disabled={!!error || printing}
            className={`
              w-16 h-16 rounded-full bg-red-600 shadow-[0_4px_0_rgb(153,27,27)] 
              active:shadow-none active:translate-y-1 transition-all border-4 border-[#e5e5e5]
              flex items-center justify-center text-white/20
              ${printing ? 'cursor-not-allowed opacity-80' : 'hover:bg-red-500'}
            `}
          >
            <Aperture size={32} />
          </button>

          <div className="h-2 w-32 bg-black/80 rounded-full mx-auto translate-y-2" />

          <div className="w-12 h-12 bg-[#222] rounded-lg border-2 border-gray-400 shadow-inner relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 to-purple-900/40" />
          </div>
        </div>

        <div className="absolute right-0 bottom-20 w-8 h-32 rounded-l-lg pattern-grip opacity-20" />
      </div>

      <div className="absolute bottom-[-10px] left-0 right-0 h-4 bg-black/20 blur-xl -z-10" />
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [recentPhotoId, setRecentPhotoId] = useState<string | null>(null);

  // Load from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPhotos(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to access localStorage", e);
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(photos.slice(0, MAX_STORED_PHOTOS)));
    } catch (e) {
      console.warn("Failed to save to localStorage", e);
    }
  }, [photos]);

  const handleCapture = (dataUrl: string) => {
    const newPhoto: Photo = {
      id: Date.now().toString(),
      dataUrl,
      timestamp: Date.now(),
    };
    
    setPhotos(prev => [newPhoto, ...prev]);
    setRecentPhotoId(newPhoto.id);
    
    // Speed up: clear developing state faster
    setTimeout(() => {
      setRecentPhotoId(null);
    }, DEVELOP_TIME_MS);
  };

  const handleDelete = (id: string) => {
    console.log("Delete requested for", id);
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#e8e6e1] text-gray-800 font-sans overflow-x-hidden flex flex-col">
      <GlobalStyles />
      
      <header className="pt-8 pb-12 px-4 flex flex-col items-center relative bg-gradient-to-b from-[#dcd9d2] to-[#e8e6e1]">
        <h1 className="mb-8 font-handwriting text-4xl text-gray-700 font-bold tracking-wider rotate-[-2deg]">
          Alvart
        </h1>
        
        <RetroCamera onCapture={handleCapture} />
        
        <p className="mt-8 text-gray-500 text-sm max-w-md text-center opacity-60">
          Point, shoot, and watch it develop. Photos are saved automatically.
        </p>
      </header>

      <main className="flex-1 px-4 pb-20 max-w-6xl mx-auto w-full">
        <div className="flex flex-wrap justify-center gap-8 perspective-1000">
          {photos.length === 0 ? (
            <div className="mt-12 text-center text-gray-400 border-2 border-dashed border-gray-300 rounded-xl p-12 w-full max-w-md">
              <Camera size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg">No photos yet.</p>
              <p className="text-sm">Take a shot with the camera above!</p>
            </div>
          ) : (
            photos.map(photo => (
              <InstantPhoto 
                key={photo.id} 
                photo={photo} 
                developing={photo.id === recentPhotoId}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </main>

      <footer className="text-center py-6 text-gray-400 text-xs font-handwriting text-lg">
        Made with a bit of nostalgia
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
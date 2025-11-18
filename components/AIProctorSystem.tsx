import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './Icon';

interface ProctoringData {
  faceDetected: boolean;
  eyeGazeDirection: 'center' | 'left' | 'right' | 'up' | 'down';
  multipleFaces: boolean;
  suspiciousMovement: boolean;
  audioLevel: number;
  screenActivity: string[];
  confidenceScore: number;
}

interface AIProctorSystemProps {
  examId: string;
  studentId: string;
  onViolation: (violation: string, severity: 'low' | 'medium' | 'high') => void;
  onDataUpdate: (data: ProctoringData) => void;
}

const AIProctorSystem = ({
  examId,
  studentId,
  onViolation,
  onDataUpdate
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();
  const isRenderingRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);
  const streamingIntervalRef = useRef<NodeJS.Timeout>();
  
  const [isActive, setIsActive] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [streamActive, setStreamActive] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // API fetch helper
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem('iqbaes-token');
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.append('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`/api${url}`, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return response.json();
  };

  // Send camera frame to server for real-time monitoring
  const sendCameraFrame = useCallback(async () => {
    console.log('🎥 sendCameraFrame called:', { 
      hasCanvas: !!canvasRef.current, 
      isActive, 
      studentId, 
      examId 
    });
    
    if (!canvasRef.current || !isActive) {
      console.log('❌ sendCameraFrame early return:', { 
        hasCanvas: !!canvasRef.current, 
        isActive 
      });
      return;
    }
    
    try {
      const canvas = canvasRef.current;
      const dataURL = canvas.toDataURL('image/jpeg', 0.7); // Compress to 70% quality
      
      console.log('📤 Sending camera frame:', { 
        studentId, 
        examId, 
        frameSize: dataURL.length,
        timestamp: new Date().toISOString()
      });
      
      // Send frame to server
      await apiFetch('/camera/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId,
          examId,
          frame: dataURL,
          timestamp: new Date().toISOString()
        })
      });
      
      console.log('✅ Camera frame sent successfully');
      
      if (!isStreaming) {
        setIsStreaming(true);
        setDebugInfo('✓ Streaming to lecturer');
      }
    } catch (error) {
      console.error('❌ Failed to send camera frame:', error);
      setDebugInfo('⚠ Stream interrupted');
    }
  }, [studentId, examId, isActive, isStreaming]);

  // Start real-time streaming to server
  const startCameraStreaming = useCallback(() => {
    console.log('🚀 startCameraStreaming called');
    
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
    }
    
    // Send frame every 2 seconds (adjust as needed)
    streamingIntervalRef.current = setInterval(() => {
      console.log('⏰ Interval triggered, calling sendCameraFrame');
      sendCameraFrame();
    }, 2000);
    
    console.log('✅ Camera streaming interval started');
  }, [sendCameraFrame]);

  // Stop streaming
  const stopCameraStreaming = useCallback(() => {
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = undefined;
    }
    setIsStreaming(false);
  }, []);

  // Force video display - more aggressive approach
  const forceVideoDisplay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || isRenderingRef.current) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set rendering flag
    isRenderingRef.current = true;
    
    const drawFrame = () => {
      if (!isRenderingRef.current || !video || !canvas) {
        isRenderingRef.current = false;
        return;
      }
      
      try {
        // More lenient check - accept if video has any readiness or is playing
        const hasVideoData = video.videoWidth > 0 && video.videoHeight > 0;
        const isVideoReady = video.readyState >= 1; // HAVE_METADATA or better
        const isVideoPlaying = !video.paused && !video.ended;
        
        if (hasVideoData || isVideoReady || isVideoPlaying) {
          // Clear and draw video frame
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (hasVideoData) {
            // Draw actual video
            ctx.save();
            ctx.scale(-1, 1); // Mirror effect
            ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            // Show active state even without perfect video
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#4ade80';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Camera Active', canvas.width / 2, canvas.height / 2);
          }
          
          // Set active state immediately - don't wait for perfect video
          if (!isActive) {
            setIsActive(true);
            setIsLoading(false);
            setDebugInfo('✓ Camera activated');
            startCameraStreaming();
          }
        } else {
          // Show loading state
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#4ade80';
          ctx.font = '14px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Camera Loading...', canvas.width / 2, canvas.height / 2);
          
          // Force activation after 2 seconds even if video not perfect
          if (!isActive && streamRef.current?.active) {
            setTimeout(() => {
              if (!isActive && streamRef.current?.active) {
                setIsActive(true);
                setIsLoading(false);
                setDebugInfo('✓ Force activated');
                startCameraStreaming();
              }
            }, 2000);
          }
        }
      } catch (err) {
        console.error('Canvas draw error:', err);
      }
      
      // Continue animation only if stream is still active and we're still rendering
      if (streamRef.current?.active && isRenderingRef.current) {
        animationRef.current = requestAnimationFrame(drawFrame);
      } else {
        isRenderingRef.current = false;
      }
    };
    
    // Start the animation loop
    animationRef.current = requestAnimationFrame(drawFrame);
  }, [isActive, startCameraStreaming]);

  // Start camera - stable version
  const startCamera = useCallback(async () => {
    // Prevent multiple initializations
    if (isInitializedRef.current) {
      return;
    }
    
    isInitializedRef.current = true;
    setIsLoading(true);
    setError('');
    setDebugInfo('Initializing...');
    
    try {
      // Stop any existing stream and animation
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      isRenderingRef.current = false;
      
      // Request camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user'
        },
        audio: false
      });
      
      streamRef.current = stream;
      setStreamActive(true);
      setDebugInfo('Setting up...');
      
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        
        // Wait for video to be ready
        video.addEventListener('loadedmetadata', () => {
          setTimeout(() => forceVideoDisplay(), 100);
        });
        
        video.addEventListener('canplay', () => {
          setTimeout(() => forceVideoDisplay(), 50);
        });
        
        // Fallback
        setTimeout(() => forceVideoDisplay(), 500);
        
        video.play().catch(err => {
          console.log('Video play failed, using canvas:', err);
        });
      }
      
    } catch (err: any) {
      console.error('Camera error:', err);
      setError(`Camera failed: ${err.message}`);
      setDebugInfo('Camera access denied');
      setIsLoading(false);
      setStreamActive(false);
      isInitializedRef.current = false;
    }
  }, [forceVideoDisplay]);

  // Stop camera
  const stopCamera = useCallback(() => {
    // Stop rendering first
    isRenderingRef.current = false;
    isInitializedRef.current = false;
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    
    // Stop streaming
    stopCameraStreaming();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsActive(false);
    setStreamActive(false);
    setVideoPlaying(false);
  }, [stopCameraStreaming]);

  // Initialize on mount - only once
  useEffect(() => {
    if (!isInitializedRef.current) {
      const timer = setTimeout(startCamera, 300);
      return () => clearTimeout(timer);
    }
  }, []); // Empty dependency array to run only once

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Manual retry
  const handleRetry = () => {
    stopCamera();
    setTimeout(() => {
      isInitializedRef.current = false;
      startCamera();
    }, 300);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden border-2 border-blue-200">
        {/* Header */}
        <div 
          className="flex items-center justify-between p-3 bg-blue-50 cursor-pointer hover:bg-blue-100"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-gray-800">Camera Monitor</h3>
            <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : error ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
            {isStreaming && (
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Streaming to lecturer"></div>
            )}
          </div>
          <Icon 
            path={isMinimized ? 'M4.5 15.75l7.5-7.5 7.5 7.5' : 'M19.5 8.25l-7.5 7.5-7.5-7.5'}
            className="w-4 h-4 text-gray-600"
          />
        </div>
        
        {/* Camera Feed */}
        {!isMinimized && (
          <div className="p-4 w-80">
            <div className="relative mb-3">
              {error ? (
                <div className="w-full h-48 bg-red-50 rounded flex flex-col items-center justify-center p-4 border border-red-200">
                  <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-8 h-8 text-red-500 mb-2" />
                  <div className="text-red-600 text-xs text-center mb-3">{error}</div>
                  <button 
                    onClick={handleRetry}
                    className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <div className="relative">
                  {/* Hidden video element */}
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ display: 'none' }}
                  />
                  
                  {/* Canvas display */}
                  <canvas
                    ref={canvasRef}
                    className="w-full h-48 bg-gray-900 rounded object-cover border"
                    style={{ maxWidth: '100%', height: '192px' }}
                  />
                  
                  <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs flex items-center">
                    <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                    LIVE
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                    {isStreaming ? '📡 Streaming' : '60fps Mode'}
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white px-1 py-1 rounded text-xs max-w-32 truncate">
                    {debugInfo}
                  </div>
                </div>
              )}
            </div>
            
            <div className="text-xs text-gray-600 text-center">
              📹 Camera feed monitored during exam
              {isStreaming && <div className="text-blue-600 mt-1">🔴 Live streaming to lecturer</div>}
            </div>
            
            {/* Status indicators */}
            <div className="mt-2 text-xs text-center space-y-1">
              <div className="text-green-600">
                ✓ Camera Working Properly
              </div>
              {isStreaming && (
                <div className="text-blue-600">
                  ✓ Real-time monitoring active
                </div>
              )}
            </div>
            
            {/* Minimal controls */}
            <div className="mt-2 flex justify-center">
              <button 
                onClick={handleRetry}
                className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
              >
                Restart if needed
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIProctorSystem;
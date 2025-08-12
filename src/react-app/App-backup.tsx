import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Howl } from 'howler';
import './App.css';

interface ClickSound {
  id: string;
  type: string;
  file: string;
  position: number; // 0-1 normalized position along the base track
  letter: string;
  color: string;
  duration: number; // seconds
  wavesurfer?: WaveSurfer;
  howl?: Howl;
}

function App() {
  const mainWaveformRef = useRef<HTMLDivElement>(null);
  const mainWavesurferRef = useRef<WaveSurfer | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const mainHowlRef = useRef<Howl | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // seconds
  const [duration, setDuration] = useState(0); // seconds (base track)
  const [isLoading, setIsLoading] = useState(true);

  const playheadRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const word = 'Xomquoca';

  const [clicks, setClicks] = useState<ClickSound[]>([
    { id: 'click-x', type: 'x', file: '/x-click.wav', position: 0.1, letter: 'X', color: '#a855f7', duration: 0.1 },
    { id: 'click-q', type: 'q', file: '/q-click.wav', position: 0.2, letter: 'Q', color: '#ec4899', duration: 0.1 },
    { id: 'click-c', type: 'c', file: '/c-click.wav', position: 0.3, letter: 'C', color: '#10b981', duration: 0.1 },
  ]);
  const clickWaveformRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Load main audio with Howler
  useEffect(() => {
    setIsLoading(true);
    
    // Load main audio
    const mainHowl = new Howl({
      src: ['/Xomquoca.wav'],
      onload: () => {
        const dur = mainHowl.duration();
        setDuration(dur);
        console.log('🎵 Main track loaded, duration:', dur.toFixed(3), 'seconds');
        
        // Load click sounds
        loadClickSounds(dur);
      },
      onend: () => {
        setIsPlaying(false);
        setCurrentTime(duration);
        pausedAtRef.current = 0;
      }
    });
    
    mainHowlRef.current = mainHowl;

    return () => {
      mainHowl.unload();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadClickSounds = async (mainDuration: number) => {
    const loadPromises = clicks.map((click) => {
      return new Promise<ClickSound>((resolve) => {
        const howl = new Howl({
          src: [click.file],
          onload: function() {
            const clickDuration = howl.duration();
            console.log(`📦 ${click.letter} click loaded:`, {
              duration: clickDuration.toFixed(3),
              position: (click.position * 100).toFixed(1) + '%',
              starts_at: (click.position * mainDuration).toFixed(3) + 's'
            });
            resolve({
              ...click,
              duration: clickDuration,
              howl
            });
          }
        });
      });
    });

    const loadedClicks = await Promise.all(loadPromises);
    setClicks(loadedClicks);
    setIsLoading(false);
    console.log('🎯 All audio loaded');
  };

  // Initialize WaveSurfer for visual waveform only (base track)
  useEffect(() => {
    if (!mainWaveformRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: mainWaveformRef.current,
      waveColor: 'rgba(139, 92, 246, 0.3)',
      progressColor: 'rgba(139, 92, 246, 0.8)',
      cursorColor: 'transparent',
      barWidth: 2,
      barRadius: 3,
      height: 80,
      normalize: true,
      interact: false,
    });

    mainWavesurferRef.current = wavesurfer;
    wavesurfer.load('/Xomquoca.wav');

    return () => {
      wavesurfer.destroy();
    };
  }, []);

  // Create tiny waveforms inside click blocks (visual only)
  useEffect(() => {
    clicks.forEach((click) => {
      const container = clickWaveformRefs.current.get(click.id);
      if (container && !click.wavesurfer) {
        container.innerHTML = '';

        const ws = WaveSurfer.create({
          container,
          waveColor: 'rgba(255, 255, 255, 0.35)',
          progressColor: 'rgba(255, 255, 255, 0)',
          cursorColor: 'transparent',
          barWidth: 1,
          barRadius: 1,
          height: 38,
          normalize: true,
          interact: false,
          hideScrollbar: true,
        });

        ws.load(click.file);

        setClicks((prev) =>
          prev.map((c) => (c.id === click.id ? { ...c, wavesurfer: ws } : c))
        );
      }
    });

    return () => {
      clicks.forEach((click) => {
        if (click.wavesurfer) click.wavesurfer.destroy();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clicks.length]);

  // Update playhead and check for click triggers
  const updatePlayback = useCallback(() => {
    if (!isPlaying || !mainHowlRef.current) return;

    const elapsed = (Date.now() - startTimeRef.current) / 1000 + pausedAtRef.current;
    const currentPos = Math.min(elapsed, duration);
    setCurrentTime(currentPos);

    // Update visual waveform progress
    if (mainWavesurferRef.current && duration > 0) {
      mainWavesurferRef.current.seekTo(currentPos / duration);
    }

    // Update playhead position
    if (playheadRef.current && timelineRef.current && duration > 0) {
      const progress = currentPos / duration;
      const timelineWidth = timelineRef.current.clientWidth;
      playheadRef.current.style.left = `${Math.max(0, Math.min(1, progress)) * timelineWidth}px`;
    }

    // Check if we need to trigger any clicks
    clicks.forEach((click) => {
      if (click.howl) {
        const clickStartTime = click.position * duration;
        const clickEndTime = clickStartTime + click.duration;
        
        // Check if this click should be playing
        if (currentPos >= clickStartTime && currentPos < clickEndTime) {
          // Check if it's already playing
          if (!click.howl.playing()) {
            // Calculate offset into the click sound
            const offset = currentPos - clickStartTime;
            click.howl.seek(offset);
            click.howl.play();
            console.log(`▶️ Playing ${click.letter} click at ${currentPos.toFixed(3)}s (offset: ${offset.toFixed(3)}s)`);
          }
        } else if (click.howl.playing() && currentPos >= clickEndTime) {
          // Stop if we've passed the end
          click.howl.stop();
        }
      }
    });

    // Continue animation if still playing
    if (currentPos < duration) {
      animationFrameRef.current = requestAnimationFrame(updatePlayback);
    } else {
      // Reached end
      handleStop();
    }
  }, [isPlaying, duration, clicks]);

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updatePlayback);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, updatePlayback]);

  const handlePlayPause = useCallback(() => {
    const mainHowl = mainHowlRef.current;
    if (!mainHowl) return;

    if (isPlaying) {
      console.log('⏸️ Pausing playback');
      mainHowl.pause();
      pausedAtRef.current = currentTime;
      
      // Pause all click sounds
      clicks.forEach(c => c.howl?.pause());
      
      setIsPlaying(false);
    } else {
      const startFrom = currentTime >= duration ? 0 : currentTime;
      
      console.log('▶️ Starting playback from:', startFrom.toFixed(3), 'seconds');
      
      // Seek main audio to position
      mainHowl.seek(startFrom);
      mainHowl.play();
      
      // Reset clicks that should be playing
      clicks.forEach(click => {
        if (click.howl) {
          click.howl.stop(); // Stop any playing clicks
          const clickStart = click.position * duration;
          if (startFrom >= clickStart && startFrom < clickStart + click.duration) {
            // This click should be playing
            const offset = startFrom - clickStart;
            click.howl.seek(offset);
            click.howl.play();
            console.log(`▶️ Resuming ${click.letter} click with offset ${offset.toFixed(3)}s`);
          }
        }
      });
      
      startTimeRef.current = Date.now();
      pausedAtRef.current = startFrom;
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, duration, clicks]);

  const handleStop = useCallback(() => {
    console.log('⏹️ Stopping playback');
    
    mainHowlRef.current?.stop();
    clicks.forEach(c => c.howl?.stop());
    
    setCurrentTime(0);
    setIsPlaying(false);
    pausedAtRef.current = 0;
    
    if (playheadRef.current) playheadRef.current.style.left = '0px';
    if (mainWavesurferRef.current) mainWavesurferRef.current.seekTo(0);
  }, [clicks]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const tl = timelineRef.current;
    if (!tl || !mainHowlRef.current) return;

    // Avoid seeking when dragging click blocks
    const target = e.target as HTMLElement;
    if (target.closest('[id^="click-"]')) return;

    const rect = tl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    const newTime = progress * duration;
    
    console.log('🎯 Seeking to:', newTime.toFixed(3), 'seconds');

    // If playing, pause first
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      mainHowlRef.current.pause();
      clicks.forEach(c => c.howl?.stop());
      setIsPlaying(false);
    }

    // Update position
    setCurrentTime(newTime);
    pausedAtRef.current = newTime;
    
    if (mainWavesurferRef.current) {
      mainWavesurferRef.current.seekTo(progress);
    }
    
    if (playheadRef.current) {
      playheadRef.current.style.left = `${x}px`;
    }

    // Resume if was playing
    if (wasPlaying) {
      setTimeout(() => handlePlayPause(), 50);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    console.log(`🎚️ Scrubbing to ${newTime.toFixed(3)}s`);
    
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      mainHowlRef.current?.pause();
      clicks.forEach(c => c.howl?.stop());
      setIsPlaying(false);
    }
    
    setCurrentTime(newTime);
    pausedAtRef.current = newTime;
    
    if (mainWavesurferRef.current && duration > 0) {
      mainWavesurferRef.current.seekTo(newTime / duration);
    }
    
    if (wasPlaying) {
      setTimeout(() => handlePlayPause(), 50);
    }
  };

  // Drag a click block
  const handleDragClick = (click: ClickSound, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const element = e.currentTarget as HTMLElement;

    const startX = e.clientX;
    const startPosition = click.position;

    const handleMouseMove = (evt: MouseEvent) => {
      const tl = timelineRef.current;
      if (!tl) return;
      const deltaX = evt.clientX - startX;
      const timelineWidth = tl.clientWidth;
      const deltaPercent = deltaX / timelineWidth;
      const newPosition = Math.max(0, Math.min(1, startPosition + deltaPercent));

      const pixelPos = newPosition * timelineWidth;
      element.style.left = `${pixelPos}px`;
    };

    const handleMouseUp = (evt: MouseEvent) => {
      const tl = timelineRef.current;
      if (tl) {
        const deltaX = evt.clientX - startX;
        const timelineWidth = tl.clientWidth;
        const deltaPercent = deltaX / timelineWidth;
        const newPosition = Math.max(0, Math.min(1, startPosition + deltaPercent));

        setClicks((prev) =>
          prev.map((c) => {
            if (c.id !== click.id) return c;
            
            console.log(`🎵 ${c.letter} click repositioned:`, {
              new_position: (newPosition * 100).toFixed(1) + '%',
              time_in_seconds: (newPosition * duration).toFixed(3),
            });
            
            return { ...c, position: newPosition };
          })
        );
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleExport = () => {
    const exportData = clicks.map((c) => ({
      letter: c.letter,
      position_seconds: Number((c.position * duration).toFixed(3)),
      normalized_position: Number(c.position.toFixed(6)),
      type: c.type,
    }));
    console.log('Click positions:', exportData);
    alert('Export to S3 not yet implemented. Check console for payload.');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  // Force re-render when timeline resizes to update click positions
  useEffect(() => {
    const tl = timelineRef.current;
    if (!tl) return;

    const ro = new ResizeObserver(() => {
      setClicks((prev) => [...prev]); // force re-render to recalc pixel positions
    });

    ro.observe(tl);
    return () => ro.disconnect();
  }, []);

  // Spacebar play/pause
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        handlePlayPause();
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handlePlayPause]);

  return (
    <div className="app">
      <div className="header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="url(#grad1)" strokeWidth="2" />
            <path d="M10 16L14 12L18 20L22 8L26 16" stroke="url(#grad2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
              <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00ff88" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          <span>Xhosa Click Overlay</span>
        </div>
        <div className="header-actions">
          <button className="btn-secondary">Settings</button>
        </div>
      </div>

      <div className="main-content">
        <div className="word-display">
          <div className="word-card">
            <div className="word-label">Current Word</div>
            <div className="word-text">{word}</div>
            <div className="word-phonetic">
              <span className="click-indicator">X</span>om
              <span className="click-indicator">q</span>uo
              <span className="click-indicator">c</span>a
            </div>
          </div>

          <div className="clicks-info">
            <div className="clicks-label">Click Consonants in Order</div>
            <div className="click-badges">
              <div className="click-badge x-click">
                <span className="click-letter">X</span>
                <span className="click-name">Lateral</span>
              </div>
              <div className="click-badge q-click">
                <span className="click-letter">Q</span>
                <span className="click-name">Alveolar</span>
              </div>
              <div className="click-badge c-click">
                <span className="click-letter">C</span>
                <span className="click-name">Dental</span>
              </div>
            </div>
          </div>
        </div>

        <div className="editor-section">
          <div className="editor-header">
            <h2>Audio Editor</h2>
            <div className="editor-instructions">
              Drag the click sounds to align them with the base recording. Click on timeline to seek. Press Space to play/pause.
            </div>
          </div>

          <div className="timeline-container" style={{ position: 'relative', marginBottom: '20px' }}>
            {/* Click Track */}
            <div className="track-label" style={{ marginBottom: '5px', fontSize: '12px', color: '#999' }}>
              <span style={{ marginRight: '10px' }}>📍 Click Track</span>
              {clicks.map((click) => (
                <span
                  key={click.id}
                  style={{
                    marginRight: '10px',
                    padding: '2px 8px',
                    backgroundColor: click.color + '33',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                >
                  {click.letter}
                </span>
              ))}
            </div>

            <div
              ref={timelineRef}
              className="click-track"
              style={{
                position: 'relative',
                height: '60px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '4px',
                marginBottom: '10px',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              onClick={handleTimelineClick}
            >
              {clicks.map((click) => {
                const timelineWidth = timelineRef.current?.clientWidth || 0;
                // Position is where the click sound starts (absolute position on timeline)
                const pixelLeft = click.position * timelineWidth;
                // Calculate width based on actual click duration
                const clickWidthPixels = duration > 0 
                  ? Math.max(40, (click.duration / duration) * timelineWidth)
                  : 60;

                return (
                  <div
                    key={click.id}
                    id={click.id}
                    style={{
                      position: 'absolute',
                      left: `${pixelLeft}px`,
                      top: '10px',
                      width: `${clickWidthPixels}px`,
                      height: '40px',
                      backgroundColor: click.color,
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      cursor: 'grab',
                      userSelect: 'none',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      transition: 'box-shadow 0.2s',
                      overflow: 'hidden',
                    }}
                    onMouseDown={(e) => handleDragClick(click, e)}
                  >
                    {/* Waveform container */}
                    <div
                      ref={(el) => {
                        if (el) clickWaveformRefs.current.set(click.id, el);
                      }}
                      style={{
                        position: 'absolute',
                        top: '1px',
                        left: '1px',
                        right: '1px',
                        bottom: '1px',
                        borderRadius: '3px',
                        opacity: 0.7,
                      }}
                    />
                    {/* Letter label */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1,
                        fontSize: '14px',
                        fontWeight: 'bold',
                        textShadow: '0 0 4px rgba(0,0,0,0.8)',
                      }}
                    >
                      {click.letter}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Main Audio Track */}
            <div className="track-label" style={{ marginBottom: '5px', fontSize: '12px', color: '#999' }}>
              <span>🎤 Base Recording</span>
            </div>

            <div
              className="main-track"
              ref={mainWaveformRef}
              style={{
                position: 'relative',
                height: '80px',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              onClick={handleTimelineClick}
            >
              {isLoading && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#999',
                  }}
                >
                  Loading waveform...
                </div>
              )}
            </div>

            {/* Playhead */}
            <div
              ref={playheadRef}
              style={{
                position: 'absolute',
                top: '0',
                left: '0',
                width: '2px',
                height: '100%',
                backgroundColor: '#00ff88',
                pointerEvents: 'none',
                zIndex: 10,
                transition: isPlaying ? 'none' : 'left 0.1s',
              }}
            />
          </div>

          <div className="controls-section">
            <div className="playback-controls">
              <button className="btn-icon play-btn" onClick={handlePlayPause} disabled={isLoading} title="Play/Pause (Space)">
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button className="btn-icon" onClick={handleStop} disabled={isLoading} title="Stop">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              </button>

              <div className="time-display">
                <span className="time-current">{formatTime(currentTime)}</span>
                <span className="time-separator">/</span>
                <span className="time-total">{formatTime(duration)}</span>
              </div>

              <div className="scrubber-container">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={handleScrub}
                  className="scrubber"
                  step="0.01"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="export-section">
          <button className="btn-primary" onClick={handleExport}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 14L14 10H11V3H9V10H6L10 14Z" />
              <path d="M4 15V17H16V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Export to S3
          </button>
          <div className="export-info">Processed file will be saved to output bucket</div>
        </div>
      </div>
    </div>
  );
}

export default App;
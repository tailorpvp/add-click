import { useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Howl } from 'howler';
import useStore from './store/useStore';
import ProgressBar from './components/ProgressBar';
import { clickOffsets } from './constants/config';
import './App.css';

function App() {
  const mainWaveformRef = useRef<HTMLDivElement>(null);
  const mainWavesurferRef = useRef<WaveSurfer | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const mainHowlRef = useRef<Howl | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dipVisualizationRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const clickWaveformRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const clickHowlsRef = useRef<Map<string, Howl>>(new Map());

  const {
    currentJob,
    progress,
    isLoading,
    error,
    audioUrl,
    duration,
    isPlaying,
    currentTime,
    clicks,
    clickTrackEnabled,
    dipAmount,
    dipWidth,
    isExporting,
    exportProgress,
    fetchNextJob,
    completeAndNext,
    uploadToS3,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    updateClick,
    toggleClick,
    setClickTrackEnabled,
    setDipAmount,
    setDipWidth,
    setIsExporting,
    setExportProgress,
  } = useStore();

  // Fetch first job on mount
  useEffect(() => {
    fetchNextJob();
  }, []);

  // Load main audio when audioUrl changes
  useEffect(() => {
    if (!audioUrl) return;

    // Clean up previous audio
    if (mainHowlRef.current) {
      mainHowlRef.current.unload();
    }
    
    // Load new audio
    const mainHowl = new Howl({
      src: [audioUrl],
      onload: () => {
        const dur = mainHowl.duration();
        setDuration(dur);
        console.log('Main track loaded, duration:', dur.toFixed(3), 'seconds');
        
        // Load click sounds
        loadClickSounds();
      },
      onend: () => {
        setIsPlaying(false);
        setCurrentTime(duration);
        pausedAtRef.current = 0;
      }
    });
    
    mainHowlRef.current = mainHowl;

    // Load waveform visualization
    if (mainWavesurferRef.current) {
      mainWavesurferRef.current.load(audioUrl);
    }

    return () => {
      mainHowl.unload();
    };
  }, [audioUrl]);

  const loadClickSounds = async () => {
    // Clear previous click howls
    clickHowlsRef.current.forEach(howl => howl.unload());
    clickHowlsRef.current.clear();

    const loadPromises = clicks.map((click) => {
      return new Promise<void>((resolve) => {
        const howl = new Howl({
          src: [click.file],
          onload: function() {
            const clickDuration = howl.duration();
            updateClick(click.id, { duration: clickDuration });
            clickHowlsRef.current.set(click.id, howl);
            console.log(`${click.letter} click loaded: ${clickDuration.toFixed(3)}s`);
            resolve();
          }
        });
      });
    });

    await Promise.all(loadPromises);
    console.log('All click sounds loaded');
  };

  // Initialize WaveSurfer for visual waveform
  useEffect(() => {
    if (!mainWaveformRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: mainWaveformRef.current,
      waveColor: '#ffffff',
      progressColor: '#ffffff',
      cursorColor: 'transparent',
      barWidth: 2,
      barRadius: 2,
      height: 64,
      normalize: true,
      interact: false,
    });

    mainWavesurferRef.current = wavesurfer;
    
    if (audioUrl) {
      wavesurfer.load(audioUrl);
    }

    return () => {
      wavesurfer.destroy();
    };
  }, []);

  // Create tiny waveforms for click blocks
  useEffect(() => {
    clicks.forEach((click) => {
      const container = clickWaveformRefs.current.get(click.id);
      if (container) {
        container.innerHTML = '';

        const ws = WaveSurfer.create({
          container,
          waveColor: '#ffffff',
          progressColor: 'rgba(255, 255, 255, 0)',
          cursorColor: 'transparent',
          barWidth: 1,
          barRadius: 1,
          height: 32,
          normalize: true,
          interact: false,
          hideScrollbar: true,
        });

        ws.load(click.file);
      }
    });
  }, [clicks]);

  // Calculate volume dip
  const calculateDipVolume = useCallback((currentPos: number) => {
    if (!clickTrackEnabled) return 1.0;
    
    let minDipFactor = 1.0;
    
    clicks.forEach((click) => {
      if (!click.enabled) return;
      
      const clickType = click.type as keyof typeof clickOffsets;
      const clickActualTime = click.position * duration + clickOffsets[clickType];
      const halfWidth = dipWidth / 2;
      
      if (currentPos >= clickActualTime - halfWidth && currentPos <= clickActualTime + halfWidth) {
        const distance = Math.abs(currentPos - clickActualTime) / halfWidth;
        const smoothedDip = (1 + Math.cos(Math.PI * distance)) / 2;
        const dipFactor = 1 - (dipAmount * smoothedDip);
        minDipFactor = Math.min(minDipFactor, dipFactor);
      }
    });
    
    return minDipFactor;
  }, [clicks, duration, dipAmount, dipWidth, clickTrackEnabled]);

  // Update playback
  const updatePlayback = useCallback(() => {
    if (!isPlaying || !mainHowlRef.current) return;

    const elapsed = (Date.now() - startTimeRef.current) / 1000 + pausedAtRef.current;
    const currentPos = Math.min(elapsed, duration);
    setCurrentTime(currentPos);

    // Apply volume dip
    const volumeFactor = calculateDipVolume(currentPos);
    mainHowlRef.current.volume(volumeFactor);

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
    if (clickTrackEnabled) {
      clicks.forEach((click) => {
        const howl = clickHowlsRef.current.get(click.id);
        if (howl && click.enabled) {
          const clickStartTime = click.position * duration;
          const clickEndTime = clickStartTime + click.duration;
          
          if (currentPos >= clickStartTime && currentPos < clickEndTime) {
            if (!howl.playing()) {
              const offset = currentPos - clickStartTime;
              howl.seek(offset);
              howl.play();
            }
          } else if (howl.playing() && currentPos >= clickEndTime) {
            howl.stop();
          }
        }
      });
    }

    if (currentPos < duration) {
      animationFrameRef.current = requestAnimationFrame(updatePlayback);
    } else {
      handleStop();
    }
  }, [isPlaying, duration, clicks, calculateDipVolume, clickTrackEnabled]);

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
      mainHowl.pause();
      pausedAtRef.current = currentTime;
      
      clickHowlsRef.current.forEach(howl => howl.pause());
      
      setIsPlaying(false);
    } else {
      const startFrom = currentTime >= duration ? 0 : currentTime;
      
      mainHowl.seek(startFrom);
      mainHowl.play();
      
      if (clickTrackEnabled) {
        clicks.forEach(click => {
          const howl = clickHowlsRef.current.get(click.id);
          if (howl && click.enabled) {
            howl.stop();
            const clickStart = click.position * duration;
            if (startFrom >= clickStart && startFrom < clickStart + click.duration) {
              const offset = startFrom - clickStart;
              howl.seek(offset);
              howl.play();
            }
          }
        });
      }
      
      startTimeRef.current = Date.now();
      pausedAtRef.current = startFrom;
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, duration, clicks, clickTrackEnabled]);

  const handleStop = useCallback(() => {
    mainHowlRef.current?.stop();
    mainHowlRef.current?.volume(1);
    clickHowlsRef.current.forEach(howl => howl.stop());
    
    setCurrentTime(0);
    setIsPlaying(false);
    pausedAtRef.current = 0;
    
    if (playheadRef.current) playheadRef.current.style.left = '0px';
    if (mainWavesurferRef.current) mainWavesurferRef.current.seekTo(0);
  }, []);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const tl = timelineRef.current;
    if (!tl || !mainHowlRef.current) return;

    const target = e.target as HTMLElement;
    if (target.closest('[id^="click-"]')) return;

    const rect = tl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    const newTime = progress * duration;

    const wasPlaying = isPlaying;
    if (wasPlaying) {
      mainHowlRef.current.pause();
      clickHowlsRef.current.forEach(howl => howl.stop());
      setIsPlaying(false);
    }

    setCurrentTime(newTime);
    pausedAtRef.current = newTime;
    
    if (mainWavesurferRef.current) {
      mainWavesurferRef.current.seekTo(progress);
    }
    
    if (playheadRef.current) {
      playheadRef.current.style.left = `${x}px`;
    }

    if (wasPlaying) {
      setTimeout(() => handlePlayPause(), 50);
    }
  };

  const handleDragClick = (click: any, e: React.MouseEvent<HTMLDivElement>) => {
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

        updateClick(click.id, { position: newPosition });
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleExport = async () => {
    if (isExporting || !currentJob) return;
    
    setIsExporting(true);
    setExportProgress(0);
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sampleRate = audioContext.sampleRate;
      const totalSamples = Math.ceil(duration * sampleRate);
      const outputBuffer = audioContext.createBuffer(2, totalSamples, sampleRate);
      const leftChannel = outputBuffer.getChannelData(0);
      const rightChannel = outputBuffer.getChannelData(1);
      
      setExportProgress(10);
      const mainResponse = await fetch(audioUrl!);
      const mainArrayBuffer = await mainResponse.arrayBuffer();
      const mainBuffer = await audioContext.decodeAudioData(mainArrayBuffer);
      
      const mainLeft = mainBuffer.getChannelData(0);
      const mainRight = mainBuffer.numberOfChannels > 1 ? mainBuffer.getChannelData(1) : mainBuffer.getChannelData(0);
      
      for (let i = 0; i < Math.min(totalSamples, mainBuffer.length); i++) {
        const timeInSeconds = i / sampleRate;
        const volumeFactor = calculateDipVolume(timeInSeconds);
        leftChannel[i] = mainLeft[i] * volumeFactor;
        rightChannel[i] = mainRight[i] * volumeFactor;
      }
      
      setExportProgress(40);
      
      if (clickTrackEnabled) {
        const clickPromises = clicks.filter(c => c.enabled).map(async (click, index) => {
          const response = await fetch(click.file);
          const arrayBuffer = await response.arrayBuffer();
          const clickBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          const clickType = click.type as keyof typeof clickOffsets;
          const clickStartTime = click.position * duration + clickOffsets[clickType];
          const startSample = Math.floor(clickStartTime * sampleRate);
          
          const clickLeft = clickBuffer.getChannelData(0);
          const clickRight = clickBuffer.numberOfChannels > 1 ? clickBuffer.getChannelData(1) : clickBuffer.getChannelData(0);
          
          for (let i = 0; i < clickBuffer.length; i++) {
            const outputIndex = startSample + i;
            if (outputIndex >= 0 && outputIndex < totalSamples) {
              leftChannel[outputIndex] += clickLeft[i];
              rightChannel[outputIndex] += clickRight[i];
            }
          }
          
          setExportProgress(40 + (index + 1) * (40 / clicks.length));
        });
        
        await Promise.all(clickPromises);
      }
      
      setExportProgress(80);
      
      // Normalize audio
      let maxSample = 0;
      for (let i = 0; i < totalSamples; i++) {
        maxSample = Math.max(maxSample, Math.abs(leftChannel[i]), Math.abs(rightChannel[i]));
      }
      
      if (maxSample > 0.95) {
        const normalizeFactor = 0.95 / maxSample;
        for (let i = 0; i < totalSamples; i++) {
          leftChannel[i] *= normalizeFactor;
          rightChannel[i] *= normalizeFactor;
        }
      }
      
      setExportProgress(90);
      
      const offlineContext = new OfflineAudioContext(2, totalSamples, sampleRate);
      const source = offlineContext.createBufferSource();
      source.buffer = outputBuffer;
      source.connect(offlineContext.destination);
      source.start();
      
      const renderedBuffer = await offlineContext.startRendering();
      const wavBlob = await audioBufferToWav(renderedBuffer);
      
      // Upload to S3
      await uploadToS3(wavBlob, currentJob.audioId);
      
      setExportProgress(100);
      
      // Mark as complete and get next
      await completeAndNext();
      
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export audio. Check console for details.');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };
  
  const audioBufferToWav = async (buffer: AudioBuffer): Promise<Blob> => {
    const numberOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    let pos = 0;
    
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };
    
    setUint32(0x46464952);
    setUint32(36 + length);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numberOfChannels);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * numberOfChannels * 2);
    setUint16(numberOfChannels * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length);
    
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    let offset = 0;
    while (offset < buffer.length) {
      for (let i = 0; i < numberOfChannels; i++) {
        let sample = channels[i][offset];
        sample = Math.max(-1, Math.min(1, sample));
        sample = sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  // Draw dip visualization
  useEffect(() => {
    const canvas = dipVisualizationRef.current;
    const timeline = timelineRef.current;
    if (!canvas || !timeline || duration === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = timeline.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 64;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const samples = canvas.width;
    for (let i = 0; i <= samples; i++) {
      const x = i;
      const timePos = (i / samples) * duration;
      const dipFactor = calculateDipVolume(timePos);
      const y = canvas.height - (dipFactor * canvas.height * 0.8) - 10;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();

    if (clickTrackEnabled) {
      clicks.forEach((click) => {
        if (!click.enabled) return;
        
        const clickType = click.type as keyof typeof clickOffsets;
        const clickActualTime = click.position * duration + clickOffsets[clickType];
        const x = (clickActualTime / duration) * canvas.width;
        
        ctx.strokeStyle = click.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
  }, [clicks, duration, dipAmount, dipWidth, calculateDipVolume, clickTrackEnabled]);

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

  if (error) {
    return (
      <div className="app">
        <div className="error-message">
          {error}
          <button onClick={fetchNextJob}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="logo">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="#7c3aed" strokeWidth="2" />
            <path d="M10 16L14 12L18 20L22 8L26 16" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Xhosa Click Editor</span>
        </div>
        <div className="header-actions">
          <ProgressBar completed={progress.completed} total={progress.total} />
        </div>
      </div>

      <div className="main-content">
        {/* Transcript Section */}
        <div className="transcript-section">
          <div className="transcript-header">Current Word</div>
          {currentJob && (
            <>
              <div className="word-info">
                <div className="current-word">
                  {currentJob.name.split('').map((char, i) => {
                    const isClick = clicks.some(c => c.letter.toLowerCase() === char.toLowerCase());
                    const clickColor = clicks.find(c => c.letter.toLowerCase() === char.toLowerCase())?.color;
                    return isClick ? (
                      <span key={i} className="click-marker" style={{ color: clickColor }}>{char}</span>
                    ) : (
                      <span key={i}>{char}</span>
                    );
                  })}
                </div>
                <div className="phonetic-display">[{currentJob.name}]</div>
              </div>
              <div className="click-legend">
                {clicks.map(click => (
                  <div key={click.id} className="click-type">
                    <span className="click-dot" style={{ background: click.color }}></span>
                    <span>{click.letter.toUpperCase()} - Click</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="editor-section">
          <div className="editor-header">
            <div className="section-title">Audio Timeline</div>
            <div className="editor-instructions">
              Drag click sounds to align • Click to seek • Space to play/pause
            </div>
          </div>

          <div className="timeline-wrapper">
            <div className="timeline-container">
              {/* Click Track */}
              <div className="track-label">
                <input
                  type="checkbox"
                  checked={clickTrackEnabled}
                  onChange={(e) => setClickTrackEnabled(e.target.checked)}
                  className="track-checkbox"
                />
                <span>Click Track</span>
                {clicks.map((click) => (
                  <span
                    key={click.id}
                    className="track-label-badge"
                    style={{
                      backgroundColor: click.enabled ? click.color + '20' : '#33333340',
                      color: click.enabled ? click.color : '#666',
                      border: `1px solid ${click.enabled ? click.color + '40' : '#333'}`
                    }}
                  >
                    {click.letter}
                  </span>
                ))}
              </div>

              <div
                ref={timelineRef}
                className="click-track"
                onClick={handleTimelineClick}
              >
                {clicks.map((click) => {
                  const timelineWidth = timelineRef.current?.clientWidth || 0;
                  const pixelLeft = click.position * timelineWidth;
                  const clickWidthPixels = duration > 0 
                    ? Math.max(40, (click.duration / duration) * timelineWidth)
                    : 60;

                  return (
                    <div
                      key={click.id}
                      id={click.id}
                      className="click-block"
                      style={{
                        left: `${pixelLeft}px`,
                        width: `${clickWidthPixels}px`,
                        backgroundColor: click.color,
                        opacity: click.enabled && clickTrackEnabled ? 1 : 0.3,
                      }}
                      onMouseDown={(e) => handleDragClick(click, e)}
                    >
                      <div
                        ref={(el) => {
                          if (el) clickWaveformRefs.current.set(click.id, el);
                        }}
                        className="click-waveform"
                      />
                      <div className="click-label">
                        {click.letter}
                      </div>
                      <input
                        type="checkbox"
                        checked={click.enabled}
                        onChange={() => toggleClick(click.id)}
                        className="click-checkbox"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Main Audio Track */}
              <div className="track-label">
                <span>Base Recording</span>
              </div>

              <div
                className="main-track"
                ref={mainWaveformRef}
                onClick={handleTimelineClick}
                style={{ position: 'relative' }}
              >
                {isLoading && (
                  <div className="loading-message">
                    Loading waveform...
                  </div>
                )}
                <canvas
                  ref={dipVisualizationRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 2
                  }}
                />
              </div>

              {/* Playhead */}
              <div
                ref={playheadRef}
                className="playhead"
                style={{
                  transition: isPlaying ? 'none' : 'left 0.1s',
                }}
              />
            </div>
          </div>

          <div className="controls-section">
            <div className="dip-controls">
              <div className="control-item">
                <label className="control-label">Dip Amount</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={dipAmount}
                  onChange={(e) => setDipAmount(parseFloat(e.target.value))}
                  className="control-slider"
                />
                <span className="control-value">{(dipAmount * 100).toFixed(0)}%</span>
              </div>
              <div className="control-item">
                <label className="control-label">Dip Width</label>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.01"
                  value={dipWidth}
                  onChange={(e) => setDipWidth(parseFloat(e.target.value))}
                  className="control-slider"
                />
                <span className="control-value">{(dipWidth * 1000).toFixed(0)}ms</span>
              </div>
            </div>
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
            </div>
          </div>
        </div>

        <div className="export-section">
          <div className="export-info">
            {isExporting ? `Saving to S3... ${exportProgress}%` : 'Ready to save'}
          </div>
          <button 
            className="btn-primary" 
            onClick={handleExport} 
            disabled={isExporting || isLoading || !currentJob}
          >
            {isExporting ? (
              <>
                <div className="spinner" />
                Saving... {exportProgress}%
              </>
            ) : (
              <>
                Save & Next
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
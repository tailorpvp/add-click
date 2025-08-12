import { create } from 'zustand';
import axios from 'axios';
import { config } from '../constants/config';

interface Job {
  name: string;
  audioId: string;
  audioUrl: string;
  editorId: string;
}

interface Progress {
  completed: number;
  total: number;
}

interface ClickSound {
  id: string;
  type: string;
  file: string;
  position: number;
  letter: string;
  color: string;
  duration: number;
  enabled: boolean;
}

interface AppState {
  // Current job
  currentJob: Job | null;
  progress: Progress;
  isLoading: boolean;
  error: string | null;
  
  // Audio state
  audioUrl: string | null;
  duration: number;
  isPlaying: boolean;
  currentTime: number;
  
  // Click track state
  clicks: ClickSound[];
  clickTrackEnabled: boolean;
  dipAmount: number;
  dipWidth: number;
  
  // Export state
  isExporting: boolean;
  exportProgress: number;
  
  // Actions
  fetchNextJob: () => Promise<void>;
  completeAndNext: () => Promise<void>;
  flagJob: (reason?: string) => Promise<void>;
  uploadToS3: (audioBlob: Blob, audioId: string) => Promise<void>;
  
  // Audio actions
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  
  // Click track actions
  setClicks: (clicks: ClickSound[]) => void;
  updateClick: (clickId: string, updates: Partial<ClickSound>) => void;
  toggleClick: (clickId: string) => void;
  setClickTrackEnabled: (enabled: boolean) => void;
  setDipAmount: (amount: number) => void;
  setDipWidth: (width: number) => void;
  generateClicksFromName: (name: string) => void;
  
  // Export actions
  setIsExporting: (exporting: boolean) => void;
  setExportProgress: (progress: number) => void;
}

const useStore = create<AppState>((set, get) => ({
  // Initial state
  currentJob: null,
  progress: { completed: 0, total: 0 },
  isLoading: false,
  error: null,
  
  audioUrl: null,
  duration: 0,
  isPlaying: false,
  currentTime: 0,
  
  clicks: [],
  clickTrackEnabled: false, // Default to off as requested
  dipAmount: 0.5,
  dipWidth: 0.2,
  
  isExporting: false,
  exportProgress: 0,
  
  // Actions
  fetchNextJob: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get(`${config.workerBaseUrl}/next-job`);
      const { name, audioId, editorId, progress } = response.data;
      
      const constructedUrl = `${config.audioBaseUrl}/${audioId}.wav`;
      
      set({ 
        currentJob: { name, audioId, audioUrl: constructedUrl, editorId },
        audioUrl: constructedUrl,
        progress,
        isLoading: false,
        clickTrackEnabled: false, // Turn off click track for new clips
        currentTime: 0,
        isPlaying: false
      });
      
      // Generate clicks based on name
      get().generateClicksFromName(name);
    } catch (error: any) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch next job',
        isLoading: false 
      });
    }
  },
  
  completeAndNext: async () => {
    const { currentJob } = get();
    if (!currentJob) return;
    
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${config.workerBaseUrl}/complete-and-next`, {
        editorId: currentJob.editorId
      });
      
      if (response.data.name) {
        const { name, audioId, editorId, progress } = response.data;
        const constructedUrl = `${config.audioBaseUrl}/${audioId}.wav`;
        
        set({ 
          currentJob: { name, audioId, audioUrl: constructedUrl, editorId },
          audioUrl: constructedUrl,
          progress,
          isLoading: false,
          clickTrackEnabled: false, // Turn off click track for new clips
          currentTime: 0,
          isPlaying: false
        });
        
        // Generate clicks based on name
        get().generateClicksFromName(name);
      } else {
        set({ 
          currentJob: null,
          progress: response.data.progress,
          isLoading: false 
        });
      }
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to complete job',
        isLoading: false 
      });
    }
  },
  
  flagJob: async (reason) => {
    const { currentJob } = get();
    if (!currentJob) return;
    
    set({ isLoading: true, error: null });
    try {
      await axios.post(`${config.workerBaseUrl}/flag-job`, {
        editorId: currentJob.editorId,
        reason
      });
      
      // After flagging, fetch the next job
      await get().fetchNextJob();
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to flag job',
        isLoading: false 
      });
    }
  },
  
  uploadToS3: async (audioBlob: Blob, audioId: string) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, `${audioId}.wav`);
      
      await axios.put(`${config.s3UploadUrl}/${audioId}.wav`, audioBlob, {
        headers: {
          'Content-Type': 'audio/wav'
        }
      });
      
      console.log(`Successfully uploaded ${audioId}.wav to S3`);
    } catch (error) {
      console.error('Failed to upload to S3:', error);
      throw error;
    }
  },
  
  // Audio actions
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  
  // Click track actions
  setClicks: (clicks) => set({ clicks }),
  
  updateClick: (clickId, updates) => set((state) => ({
    clicks: state.clicks.map(c => 
      c.id === clickId ? { ...c, ...updates } : c
    )
  })),
  
  toggleClick: (clickId) => set((state) => ({
    clicks: state.clicks.map(c => 
      c.id === clickId ? { ...c, enabled: !c.enabled } : c
    )
  })),
  
  setClickTrackEnabled: (enabled) => set({ clickTrackEnabled: enabled }),
  setDipAmount: (amount) => set({ dipAmount: amount }),
  setDipWidth: (width) => set({ dipWidth: width }),
  
  generateClicksFromName: (name: string) => {
    // Parse the name to find click consonants and their positions
    const clickTypes: Record<string, { color: string, file: string }> = {
      'x': { color: '#c084fc', file: `${config.clickSoundsBaseUrl}x-click.wav` },
      'q': { color: '#f472b6', file: `${config.clickSoundsBaseUrl}q-click.wav` },
      'c': { color: '#34d399', file: `${config.clickSoundsBaseUrl}c-click.wav` },
      'g': { color: '#fbbf24', file: `${config.clickSoundsBaseUrl}g-click.wav` }, // Assuming you might have more
    };
    
    const newClicks: ClickSound[] = [];
    const nameLower = name.toLowerCase();
    const totalLength = nameLower.length;
    
    // Find all click consonants in the name
    for (let i = 0; i < nameLower.length; i++) {
      const char = nameLower[i];
      if (clickTypes[char]) {
        const position = (i / totalLength) * 0.8 + 0.1; // Distribute from 10% to 90% of track
        newClicks.push({
          id: `click-${char}-${i}`,
          type: char,
          file: clickTypes[char].file,
          position: Math.min(0.9, Math.max(0.1, position)),
          letter: char.toUpperCase(),
          color: clickTypes[char].color,
          duration: 0.1, // Will be updated when loaded
          enabled: true
        });
      }
    }
    
    set({ clicks: newClicks });
  },
  
  // Export actions
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setExportProgress: (progress) => set({ exportProgress: progress }),
}));

export default useStore;
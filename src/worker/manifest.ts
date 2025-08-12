export interface Job {
  name: string;
  audioId: string;
}

// *** FRONT-END ENGINEER: The public URL for audio files will be constructed as:
// `${AUDIO_BASE_URL}/${audioId}.wav`
// The AUDIO_BASE_URL will be provided via environment variables.
export const MANIFEST: Job[] = [
  // =======================================================
  // === PASTE YOUR 500 NAME/FILE OBJECTS HERE ===
  // =======================================================
  { "name": "Cebo", "audioId": "cebo" },
  { "name": "Nonqoba", "audioId": "nonqaba" },
  { "name": "xolisa", "audioId": "xolisa" },
  { "name": "Krige", "audioId": "krige" },
  // ... etc.
  // =======================================================
];
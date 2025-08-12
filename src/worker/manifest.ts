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
  { "name": "Xomquoca", "audioId": "xomquoca-001" },
  { "name": "Nonqoba", "audioId": "nonqoba-002" },
  { "name": "Ayanda", "audioId": "ayanda-003" },
  { "name": "Buhle", "audioId": "buhle-004" },
  // ... etc.
  // =======================================================
];
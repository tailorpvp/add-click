export const config = {
  // Hardcoded values since Cloudflare doesn't inject env vars at runtime
  audioBaseUrl: 'https://temp-public-bucket-d6aa00ea.s3.us-east-1.amazonaws.com/raw_clips_start',
  s3UploadUrl: 'https://temp-public-bucket-d6aa00ea.s3.us-east-1.amazonaws.com/processed_start',
  // When deployed to Cloudflare, use relative URL. For local dev, use localhost
  workerBaseUrl: import.meta.env.DEV ? 'http://localhost:8787/api' : '/api',
  clickSoundsBaseUrl: '/',
} as const;

export const clickOffsets = {
  'x': 0.040, // 40ms
  'c': 0.050, // 50ms
  'q': 0.016  // 16ms
} as const;
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { MANIFEST, Job } from './manifest';

// --- (No changes to these interfaces) ---
interface QueueState {
  nextIndex: number;
  completedCount: number;
  totalCount: number;
  lockedItems: Record<string, number>;
  completedItems: Record<string, boolean>;
}

export interface Env {
  DB: KVNamespace;
  FLAGGED_DB: KVNamespace; // Added binding for the new KV
  AUDIO_BASE_URL: string;
  S3_UPLOAD_URL: string;
}

const app = new Hono<{ Bindings: Env }>();
const LOCK_DURATION_MS = 5 * 60 * 1000;

app.use('/api/*', cors());


// --- (No changes to the findAndLockNextJob helper function) ---
function findAndLockNextJob(state: QueueState): { job: Job, editorId: string } | null {
    // ... (This function remains exactly the same as before)
    const now = Date.now();
    const totalJobs = MANIFEST.length;

    for (let i = 0; i < totalJobs; i++) {
        const checkIndex = (state.nextIndex + i) % totalJobs;
        const isCompleted = state.completedItems[checkIndex];
        const lockExpiry = state.lockedItems[checkIndex];
        const isLocked = lockExpiry && now < lockExpiry;

        if (!isCompleted && !isLocked) {
            const newLockExpiry = now + LOCK_DURATION_MS;
            state.lockedItems[checkIndex] = newLockExpiry;
            state.nextIndex = (checkIndex + 1) % totalJobs;
            const job = MANIFEST[checkIndex];
            const editorId = `${checkIndex}-${newLockExpiry}`;
            return { job, editorId };
        }
    }
    return null;
}


// --- (No changes to GET /api/next-job) ---
app.get('/api/next-job', async (c) => {
    // ... (This endpoint remains exactly the same as before)
    const kv = c.env.DB;
    let state = await kv.get<QueueState>('queue_state', 'json');

    if (!state) {
      state = {
        nextIndex: 0,
        completedCount: 0,
        totalCount: MANIFEST.length,
        lockedItems: {},
        completedItems: {},
      };
    }

    const result = findAndLockNextJob(state);

    if (!result) {
      return c.json({ message: 'All jobs are complete or currently in progress.' }, 404);
    }

    await kv.put('queue_state', JSON.stringify(state));

    const { job, editorId } = result;
    
    return c.json({
      name: job.name,
      audioId: job.audioId,
      audioUrl: `${c.env.AUDIO_BASE_URL}/${job.audioId}.wav`,
      editorId: editorId,
      progress: {
        completed: state.completedCount,
        total: state.totalCount,
      },
    });
});


// --- (No changes to POST /api/complete-and-next) ---
app.post('/api/complete-and-next', async (c) => {
    // ... (This endpoint remains exactly the same as before)
    const { editorId: completedEditorId } = await c.req.json<{ editorId: string }>();

    if (!completedEditorId) {
      return c.json({ error: '`editorId` of the completed job is required.' }, 400);
    }

    const kv = c.env.DB;
    let state = await kv.get<QueueState>('queue_state', 'json');

    if (!state) {
      return c.json({ error: 'System state not found. Please refresh.' }, 500);
    }

    const [indexStr, expiryStr] = completedEditorId.split('-');
    const completedIndex = parseInt(indexStr, 10);

    if (state.lockedItems[completedIndex] === parseInt(expiryStr, 10)) {
      delete state.lockedItems[completedIndex];
      if (!state.completedItems[completedIndex]) {
          state.completedItems[completedIndex] = true;
          state.completedCount++;
      }
    } else {
      console.log(`Stale completion signal received for index ${completedIndex}`);
    }

    const nextResult = findAndLockNextJob(state);

    await kv.put('queue_state', JSON.stringify(state));
    
    if (!nextResult) {
      return c.json({ 
          message: 'Great work, all jobs are complete!',
          progress: {
              completed: state.completedCount,
              total: state.totalCount,
          }
      }, 200);
    }

    const { job: nextJob, editorId: nextEditorId } = nextResult;

    return c.json({
      name: nextJob.name,
      audioId: nextJob.audioId,
      audioUrl: `${c.env.AUDIO_BASE_URL}/${nextJob.audioId}.wav`,
      editorId: nextEditorId,
      progress: {
        completed: state.completedCount,
        total: state.totalCount,
      },
    });
});

// =====================================================================
// === NEW ENDPOINT: Flag a job as needing review/re-render          ===
// =====================================================================
app.post('/api/flag-job', async (c) => {
  const { editorId, reason } = await c.req.json<{ editorId: string; reason?: string }>();

  if (!editorId) {
    return c.json({ error: '`editorId` of the job to flag is required.' }, 400);
  }

  // Use the new KV namespace for flagged items
  const flaggedDb = c.env.FLAGGED_DB;
  const mainDb = c.env.DB;

  const [indexStr, expiryStr] = editorId.split('-');
  const flaggedIndex = parseInt(indexStr, 10);
  const job = MANIFEST[flaggedIndex];

  // 1. Log the flagged item in its own KV store for later retrieval.
  // The key is the job name, value is an object with details.
  await flaggedDb.put(
    job.name,
    JSON.stringify({
      name: job.name,
      audioId: job.audioId,
      reason: reason || 'No reason provided.',
      flaggedAt: new Date().toISOString(),
    })
  );

  // 2. Treat the job as "completed" in the main queue to prevent it
  // from being served to another user again in this session.
  let state = await mainDb.get<QueueState>('queue_state', 'json');
  if (state) {
    // Validate the lock
    if (state.lockedItems[flaggedIndex] === parseInt(expiryStr, 10)) {
        delete state.lockedItems[flaggedIndex]; // Remove the lock
        if (!state.completedItems[flaggedIndex]) {
            state.completedItems[flaggedIndex] = true; // Mark as done
            state.completedCount++;
        }
        await mainDb.put('queue_state', JSON.stringify(state));
    }
  }

  // 3. Respond with success. The front-end should then immediately
  // call `/api/complete-and-next` with the same `editorId` to get the next job.
  // This simplifies the logic by reusing the existing "get next" flow.
  return c.json({
    success: true,
    message: `'${job.name}' was flagged successfully. Fetching next job.`,
  });
});

export default app;
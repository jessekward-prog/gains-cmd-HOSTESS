// Non-2xx responses throw with the server's own error message when it sent one
// ("Invalid email or password"), not just the status code.
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    // The session lost its PIN unlock (logged out, expired) — reload to the PIN screen.
    if (res.status === 401 && data?.pinRequired) window.location.reload();
    throw new Error(data?.error || `${method} ${url} failed: ${res.status}`);
  }
  return res.json();
}

const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

// Auth
export const checkAuth = () => api.get('/api/auth/check');

// Programs
export const getPrograms = () => api.get('/api/programs');
export const createProgram = (name, workouts) => api.post('/api/programs', { name, workouts });
export const updateProgram = (id, name, workouts) => api.put(`/api/programs/${id}`, { name, workouts });
export const deleteProgram = (id) => api.del(`/api/programs/${id}`);

// Workouts
export const getWorkoutHistory = () => api.get('/api/workout-history');
export const saveWorkout = (data) => api.post('/api/workout', data);
export const deleteWorkoutHistory = (id) => api.del(`/api/workout-history/${id}`);
export const analyzeWorkout = (data) => api.post('/api/analyze-workout', data);

// Active Workout
export const getActiveWorkout = () => api.get('/api/active-workout');
export const saveActiveWorkout = (data) => api.post('/api/active-workout', data);
export const clearActiveWorkout = () => api.del('/api/active-workout');

// Settings
export const getSettings = () => api.get('/api/settings');
export const saveAppearance = (appearance) => api.post('/api/appearance', { appearance });
export const saveExerciseLinks = (links) => api.post('/api/exercise-links', { links });
export const suggestExerciseLinks = (items) => api.post('/api/exercise-links/suggest', { items });
export const updateAggression = (data) => api.post('/api/aggression', data);

// Chat
export const sendChat = (messages) => api.post('/api/chat', { messages });
export const getChatHistory = () => api.get('/api/chat-history');
export const clearChatHistory = () => api.del('/api/chat-history');

// Exercise Notes
export const exerciseNotes = (exerciseName, exerciseTarget, message, history) =>
  api.post('/api/exercise-notes', { exerciseName, exerciseTarget, message, history });
export const getRecoveryNotes = () => api.get('/api/recovery-notes');
export const setRecoveryStatus = (exerciseName, status, note) =>
  api.post('/api/recovery-status', { exerciseName, status, note });

// Recommendations
export const generateRecommendations = (trainingSettings) =>
  api.post('/api/generate-recommendations', { trainingSettings });

// Exercise categorization

// Wizard
export const wizardInit = (programSummary) => api.post('/api/wizard-init', { programSummary });
export const wizardChat = (messages, programSummary) =>
  api.post('/api/wizard-chat', { messages, programSummary });

// Manual review

// Cardio stats
export const extractCardioStats = (imageData, mediaType) =>
  api.post('/api/extract-cardio-stats', { imageData, mediaType });

// Substitution

// Training Report

// Workout Remix
export const remixWorkout = (workout, instruction, mode) =>
  api.post('/api/remix-workout', { workout, instruction, mode });

// Workout Sharing
export const shareWorkout = (workoutData, workoutName) =>
  api.post('/api/workouts/share', { workoutData, workoutName });
export const previewShare = (code) => api.get(`/api/share/${code}`);
export const importShare = (code) => api.post(`/api/share/${code}/import`, {});

// The Programs screen's heading. Empty means the default, built from the
// account's username. Stored like the other appearance settings, so
// AppearanceSync carries it to other devices.
export const GREETING_KEY = 'gains-cmd-greeting';
export const readGreeting = () => { try { return localStorage.getItem(GREETING_KEY) || ''; } catch { return ''; } };
export const defaultGreeting = (user) => (user?.username ? `Hello, ${user.username}` : 'Hello');

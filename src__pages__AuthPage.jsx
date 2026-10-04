import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Button from '../components/Button';
import { pageVariants } from '../lib/variants';

export default function AuthPage() {
  const { login, register, resetPwd, recoveryPhrase, clearPhrase } = useAuth();
  const { bannerEnabled, bannerText } = useTheme();
  const [tab, setTab] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [username, setUsername] = useState('');
  const [phrase, setPhrase] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const handleLogin = useCallback(async (e) => {
    e?.preventDefault();
    if (!email || !password) return setError('All fields required');
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      if (!data.success) setError(data.error || 'Login failed');
    } catch (e) {
      setError(e instanceof TypeError ? 'Connection error' : e.message);
    } finally {
      setLoading(false);
    }
  }, [email, password, login]);

  const handleRegister = useCallback(async (e) => {
    e?.preventDefault();
    if (!username || !email || !password) return setError('All fields required');
    if (password !== password2) return setError('Passwords do not match');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setError('');
    setLoading(true);
    try {
      const data = await register(email, password, username);
      if (!data.success) setError(data.error || 'Registration failed');
    } catch (e) {
      setError(e instanceof TypeError ? 'Connection error' : e.message);
    } finally {
      setLoading(false);
    }
  }, [username, email, password, password2, register]);

  const handleReset = useCallback(async (e) => {
    e?.preventDefault();
    if (!email || !phrase || !newPwd) return setError('All fields required');
    if (newPwd.length < 8) return setError('Password must be at least 8 characters');
    setError('');
    setLoading(true);
    try {
      const data = await resetPwd(email, phrase, newPwd);
      if (!data.success) setError(data.error || 'Reset failed');
    } catch (e) {
      setError(e instanceof TypeError ? 'Connection error' : e.message);
    } finally {
      setLoading(false);
    }
  }, [email, phrase, newPwd, resetPwd]);

  const copyPhrase = useCallback(() => {
    navigator.clipboard.writeText(recoveryPhrase).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [recoveryPhrase]);

  // Recovery phrase screen
  if (recoveryPhrase) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-0 p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm bg-bg-1 border border-border-strong rounded-2xl overflow-hidden"
        >
          <div className="p-6">
            <div className="text-center mb-4">
              <span className="text-xs font-mono text-text-tertiary tracking-widest">RECOVERY PHRASE</span>
            </div>
            <div className="bg-bg-0 border border-accent/20 rounded-xl p-4 mb-4 text-center">
              <p className="font-mono font-bold text-accent text-lg tracking-wider break-all leading-relaxed">
                {recoveryPhrase}
              </p>
            </div>
            <p className="text-xs text-text-tertiary text-center mb-4 font-mono">
              ⚠️ SAVE THIS PHRASE. IT WILL NOT BE SHOWN AGAIN.
            </p>
            <div className="flex flex-col gap-3">
              <Button variant="secondary" onClick={copyPhrase} className="w-full">
                {copied ? '✓ Copied' : 'Copy to Clipboard'}
              </Button>
              <Button variant="primary" onClick={clearPhrase} className="w-full">
                I Have Saved This — Enter
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-0 p-4">
      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        className="w-full max-w-sm bg-bg-1 border border-border-strong rounded-2xl overflow-hidden"
      >
        {/* Banner */}
        {bannerEnabled ? (
          <div className="border-b border-border">
            <img src="/icons/banner.png" alt="Gains_CMD" className="w-full" />
          </div>
        ) : (
          <div className="border-b border-border px-4 py-5 text-center">
            <span className="font-display font-bold text-xl text-text-primary tracking-tight">{bannerText || 'Gains_CMD'}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border">
          {['login', 'register', 'reset'].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 py-3 text-[10px] font-mono tracking-widest uppercase transition-colors border-b-2 ${
                tab === t
                  ? 'text-accent border-accent/50'
                  : 'text-text-tertiary border-transparent hover:text-text-secondary'
              }`}
            >
              {t === 'reset' ? 'Reset Pwd' : t}
            </button>
          ))}
        </div>

        {/* Forms */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 px-3 py-2 bg-error/10 border-l-2 border-error/40 text-error text-xs font-mono"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {tab === 'login' && (
              <motion.form key="login" variants={pageVariants} initial="initial" animate="animate" exit="exit" onSubmit={handleLogin} className="flex flex-col gap-3">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <Button type="submit" disabled={loading} className="w-full mt-2">
                  {loading ? 'Logging in...' : 'Login'}
                </Button>
              </motion.form>
            )}

            {tab === 'register' && (
              <motion.form key="register" variants={pageVariants} initial="initial" animate="animate" exit="exit" onSubmit={handleRegister} className="flex flex-col gap-3">
                <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <input type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <input type="password" placeholder="Confirm Password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password"
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <Button type="submit" disabled={loading} className="w-full mt-2">
                  {loading ? 'Creating...' : 'Create Account'}
                </Button>
              </motion.form>
            )}

            {tab === 'reset' && (
              <motion.form key="reset" variants={pageVariants} initial="initial" animate="animate" exit="exit" onSubmit={handleReset} className="flex flex-col gap-3">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <input type="text" placeholder="Recovery Phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)}
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <input type="password" placeholder="New Password (min 8)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors" />
                <Button type="submit" disabled={loading} className="w-full mt-2">
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

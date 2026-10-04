import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import { pageVariants } from '../lib/variants';
import * as api from '../lib/api';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';

marked.use({ gfm: true, breaks: true });

function renderText(text) {
  let html = marked.parse(text);
  html = html.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
  return html;
}

export default function CoachPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef(null);
  const autoScrollRef = useRef(true);
  const messagesAreaRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.getChatHistory().then((data) => {
      if (data.success && data.messages?.length > 0) {
        setMessages(data.messages.map((m) => ({ role: m.role, content: m.content })));
      } else {
        setMessages([{
          role: 'assistant',
          content: "Hey! I'm your AI fitness coach. I can help with exercise form, program design, nutrition, recovery, and progressive overload. What would you like to know?",
        }]);
      }
    }).catch(() => {
      setMessages([{
        role: 'assistant',
        content: "Hey! I'm your AI fitness coach. Ask me anything about your training!",
      }]);
    });
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    autoScrollRef.current = true;
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);
    try {
      const data = await api.sendChat(newMessages);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.success ? data.response : 'Sorry, something went wrong. Please try again.',
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, messages, loading]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleClearHistory = useCallback(async () => {
    try {
      await api.clearChatHistory();
      setMessages([{ role: 'assistant', content: "Chat cleared! How can I help you today?" }]);
    } catch {}
    setShowClearConfirm(false);
  }, []);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="g-root flex flex-col h-full"
    >
      {/* Header */}
      <div className="px-5 pt-2.5 pb-2 flex-shrink-0 flex items-end justify-between">
        <div>
          <h1 className="mt-3 mb-0.5 g-h1">Coach</h1>
          <p className="text-[13px] text-text-secondary">Your personal fitness advisor</p>
        </div>
        {messages.length > 1 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-text-tertiary hover:text-error p-2 transition-colors"
            style={{ font: '500 11px var(--font-mono)' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesAreaRef}
        className="flex-1 overflow-y-auto px-4 pt-2 pb-3 overscroll-contain"
        onScroll={() => {
          const el = messagesAreaRef.current;
          if (!el) return;
          autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
              className={`mb-2.5 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' ? (
                <div
                  className="max-w-[82%] px-4 py-3 text-sm bg-bg-1 text-text-primary coach-prose"
                  style={{ lineHeight: 1.5, borderRadius: '20px 20px 20px 6px' }}
                  dangerouslySetInnerHTML={{ __html: renderText(msg.content) }}
                />
              ) : (
                <div className="max-w-[82%] px-4 py-3 text-sm bg-accent whitespace-pre-wrap" style={{ lineHeight: 1.5, borderRadius: '20px 20px 6px 20px', color: 'var(--color-on-accent)' }}>
                  {msg.content}
                </div>
              )}
            </motion.div>
          ))}

          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-2.5 flex justify-start"
            >
              <div className="px-4 py-3.5 bg-bg-1 flex gap-1 fx-dots" style={{ borderRadius: '20px 20px 20px 6px' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-text-secondary" /><span className="w-1.5 h-1.5 rounded-full bg-text-secondary" /><span className="w-1.5 h-1.5 rounded-full bg-text-secondary" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3.5 pb-3 pt-2.5 bg-bg-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach…"
            className="flex-1 min-w-0 min-h-[50px] bg-bg-1 rounded-[18px] px-[18px] py-[15px] text-sm font-medium text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent/40 resize-none overflow-y-auto leading-snug"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex-shrink-0 w-[50px] h-[50px] rounded-[18px] bg-accent flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-all"
            style={{ color: 'var(--color-on-accent)' }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 12V3M7.5 3L3 7.5M7.5 3L12 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Chat History?"
        message="This will delete all messages. This cannot be undone."
        onConfirm={handleClearHistory}
        onCancel={() => setShowClearConfirm(false)}
      />
    </motion.div>
  );
}

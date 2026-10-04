import { createContext, useContext, useState, useCallback, useRef } from 'react';

const HeaderMessageContext = createContext(null);

export function HeaderMessageProvider({ children }) {
  const [message, setMessage] = useState(null);
  const queueRef = useRef([]);
  const isPlayingRef = useRef(false);

  const showHeaderMessage = useCallback((msg) => {
    queueRef.current.push(msg);
    if (!isPlayingRef.current) {
      processQueue();
    }
  }, []);

  function processQueue() {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      setMessage(null);
      return;
    }
    isPlayingRef.current = true;
    const msg = queueRef.current.shift();
    setMessage(msg);
    // Message will auto-clear after animation completes (handled by AppHeader)
  }

  const onMessageComplete = useCallback(() => {
    // Small delay before next message or clearing
    setTimeout(() => {
      processQueue();
    }, 300);
  }, []);

  return (
    <HeaderMessageContext.Provider value={{ message, showHeaderMessage, onMessageComplete }}>
      {children}
    </HeaderMessageContext.Provider>
  );
}

export const useHeaderMessage = () => useContext(HeaderMessageContext);

import { motion } from 'framer-motion';

export default function ThinkingDots({ size = 'md', className = '' }) {
  const dotSize = size === 'sm' ? 'w-1 h-1' : size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5';
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`rounded-full bg-current ${dotSize}`}
          animate={{ opacity: [0.25, 1, 0.25], scale: [0.7, 1, 0.7] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

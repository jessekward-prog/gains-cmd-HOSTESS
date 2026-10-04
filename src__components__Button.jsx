import { motion } from 'framer-motion';
import { tapScale } from '../lib/variants';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  ...props
}) {
  const base = 'tap-target font-display font-medium rounded-xl transition-colors select-none inline-flex items-center justify-center gap-2';

  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent',
    secondary: 'bg-bg-3 text-text-primary border border-border hover:bg-bg-4',
    ghost: 'bg-transparent text-text-secondary hover:bg-bg-3 hover:text-text-primary',
    danger: 'bg-error/15 text-error border border-error/30 hover:bg-error/25',
    success: 'bg-success/15 text-success border border-success/30 hover:bg-success/25',
  };

  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base tap-target-lg',
  };

  return (
    <motion.button
      whileTap={disabled ? undefined : tapScale}
      className={`${base} ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  );
}

import { motion } from 'framer-motion';

// Subtle, fast page entrance — used once per top-level page, not per component,
// so navigating between screens feels alive without becoming distracting.
export default function PageTransition({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

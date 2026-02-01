/**
 * Component: Drawer
 * Sliding panel for trace/details
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import './Drawer.css';

const Drawer = ({
  isOpen,
  onClose,
  title,
  children,
  position = 'right', // right, bottom
  size = 'md',        // sm, md, lg
  overlay = true,
  className = '',
}) => {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen && overlay) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, overlay]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const variants = {
    right: {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' },
    },
    bottom: {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%' },
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="drawer-portal">
          {/* Backdrop */}
          {overlay && (
            <motion.div
              className="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              aria-hidden="true"
            />
          )}
          
          {/* Drawer */}
          <motion.div
            className={`drawer drawer-${position} drawer-${size} ${className}`}
            role="dialog"
            aria-modal="true"
            initial={variants[position].initial}
            animate={variants[position].animate}
            exit={variants[position].exit}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 35
            }}
          >
            {/* Header */}
            <div className="drawer-header">
              <h2 className="drawer-title">{title}</h2>
              <IconButton
                icon={<X />}
                label="Close"
                onClick={onClose}
              />
            </div>
            
            {/* Content */}
            <div className="drawer-content">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Drawer;

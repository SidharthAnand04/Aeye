/**
 * Component: Modal
 * Premium modal dialog with animations
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import './Modal.css';

const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md', // sm, md, lg, xl
  showClose = true,
  closeOnOverlay = true,
  className = '',
}) => {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-portal">
          {/* Backdrop */}
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOnOverlay ? onClose : undefined}
            aria-hidden="true"
          />
          
          {/* Modal */}
          <div className="modal-container">
            <motion.div
              className={`modal modal-${size} ${className}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ 
                duration: 0.2,
                ease: [0.4, 0, 0.2, 1]
              }}
            >
              {/* Header */}
              {(title || showClose) && (
                <div className="modal-header">
                  <div className="modal-header-text">
                    {title && <h2 id="modal-title" className="modal-title">{title}</h2>}
                    {description && <p className="modal-description">{description}</p>}
                  </div>
                  {showClose && (
                    <IconButton
                      icon={<X />}
                      label="Close"
                      onClick={onClose}
                      className="modal-close"
                    />
                  )}
                </div>
              )}
              
              {/* Content */}
              <div className="modal-content">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

// Modal Actions for footer
export const ModalActions = ({ children, className = '' }) => (
  <div className={`modal-actions ${className}`}>
    {children}
  </div>
);

export default Modal;

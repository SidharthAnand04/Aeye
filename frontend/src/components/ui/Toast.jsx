/**
 * Component: Toast
 * Premium toast notifications
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import './Toast.css';

// Toast Context
const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// Toast Provider
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ 
    title, 
    description, 
    variant = 'default', 
    duration = 5000 
  }) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, description, variant }]);
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (title, description) => addToast({ title, description, variant: 'success' }),
    error: (title, description) => addToast({ title, description, variant: 'error' }),
    warning: (title, description) => addToast({ title, description, variant: 'warning' }),
    info: (title, description) => addToast({ title, description, variant: 'info' }),
    dismiss: removeToast,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// Toast Container
const ToastContainer = ({ toasts, onRemove }) => {
  return (
    <div className="toast-container" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onDismiss={() => onRemove(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

// Toast Component
const Toast = ({ id, title, description, variant, onDismiss }) => {
  const icons = {
    success: <CheckCircle />,
    error: <AlertCircle />,
    warning: <AlertTriangle />,
    info: <Info />,
    default: null,
  };

  return (
    <motion.div
      layout
      className={`toast toast-${variant}`}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, transition: { duration: 0.2 } }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25
      }}
    >
      {icons[variant] && (
        <div className="toast-icon">{icons[variant]}</div>
      )}
      <div className="toast-content">
        {title && <p className="toast-title">{title}</p>}
        {description && <p className="toast-description">{description}</p>}
      </div>
      <button 
        className="toast-close" 
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

export default Toast;

/**
 * Component: Badge
 * Status badges and labels
 */

import React from 'react';
import { motion } from 'framer-motion';
import './Badge.css';

const Badge = ({
  children,
  variant = 'default', // default, primary, success, warning, error
  size = 'md',         // sm, md
  dot = false,
  pulse = false,
  className = '',
  ...props
}) => {
  const classes = [
    'badge',
    `badge-${variant}`,
    `badge-${size}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} {...props}>
      {dot && (
        <span className={`badge-dot ${pulse ? 'badge-dot-pulse' : ''}`} />
      )}
      {children}
    </span>
  );
};

// Status Badge with animated states
export const StatusBadge = ({ status, label, className = '' }) => {
  const statusConfig = {
    idle: { variant: 'default', label: label || 'Idle', dot: false },
    active: { variant: 'success', label: label || 'Active', dot: true, pulse: true },
    processing: { variant: 'primary', label: label || 'Processing', dot: true, pulse: true },
    speaking: { variant: 'primary', label: label || 'Speaking', dot: true, pulse: true },
    error: { variant: 'error', label: label || 'Error', dot: true },
    recording: { variant: 'error', label: label || 'Recording', dot: true, pulse: true },
  };

  const config = statusConfig[status] || statusConfig.idle;

  return (
    <Badge
      variant={config.variant}
      dot={config.dot}
      pulse={config.pulse}
      className={className}
    >
      {config.label}
    </Badge>
  );
};

// Animated Processing Indicator
export const ProcessingIndicator = ({ label = 'Processing', className = '' }) => (
  <motion.div 
    className={`processing-indicator ${className}`}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
  >
    <div className="processing-dots">
      <motion.span
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
      />
      <motion.span
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
      />
      <motion.span
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
      />
    </div>
    <span className="processing-label">{label}</span>
  </motion.div>
);

// Speaking Indicator with sound wave animation
export const SpeakingIndicator = ({ label = 'Speaking', className = '' }) => (
  <motion.div 
    className={`speaking-indicator ${className}`}
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
  >
    <div className="speaking-waves">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.span
          key={i}
          animate={{ scaleY: [0.4, 1, 0.4] }}
          transition={{ 
            repeat: Infinity, 
            duration: 0.8, 
            delay: i * 0.1,
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
    <span className="speaking-label">{label}</span>
  </motion.div>
);

export default Badge;

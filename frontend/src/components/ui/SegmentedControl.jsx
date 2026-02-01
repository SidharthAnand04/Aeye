/**
 * Component: SegmentedControl (Tabs)
 * Premium segmented control for mode switching
 */

import React from 'react';
import { motion } from 'framer-motion';
import './SegmentedControl.css';

const SegmentedControl = ({
  options,
  value,
  onChange,
  size = 'md', // sm, md, lg
  fullWidth = false,
  className = '',
  ...props
}) => {
  const selectedIndex = options.findIndex(opt => opt.value === value);

  return (
    <div 
      className={`segmented-control segmented-${size} ${fullWidth ? 'segmented-full' : ''} ${className}`}
      role="tablist"
      {...props}
    >
      {/* Animated Background Indicator */}
      <motion.div
        className="segmented-indicator"
        initial={false}
        animate={{
          x: `${selectedIndex * 100}%`,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 35
        }}
        style={{ width: `${100 / options.length}%` }}
      />
      
      {/* Options */}
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          className={`segmented-option ${value === option.value ? 'segmented-option-active' : ''}`}
          onClick={() => onChange(option.value)}
          disabled={option.disabled}
        >
          {option.icon && <span className="segmented-icon">{option.icon}</span>}
          <span className="segmented-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
};

export default SegmentedControl;

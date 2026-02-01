/**
 * Component: Toggle
 * Premium toggle switch
 */

import React from 'react';
import { motion } from 'framer-motion';
import './Toggle.css';

const Toggle = ({
  checked,
  onChange,
  label,
  description,
  size = 'md', // sm, md
  disabled = false,
  className = '',
  ...props
}) => {
  const id = props.id || `toggle-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={`toggle-wrapper ${className}`}>
      <label htmlFor={id} className="toggle-label-wrapper">
        {(label || description) && (
          <div className="toggle-text">
            {label && <span className="toggle-label">{label}</span>}
            {description && <span className="toggle-description">{description}</span>}
          </div>
        )}
        <button
          id={id}
          role="switch"
          aria-checked={checked}
          className={`toggle toggle-${size} ${checked ? 'toggle-checked' : ''} ${disabled ? 'toggle-disabled' : ''}`}
          onClick={() => !disabled && onChange(!checked)}
          disabled={disabled}
          {...props}
        >
          <motion.span
            className="toggle-thumb"
            initial={false}
            animate={{
              x: checked ? (size === 'sm' ? 14 : 20) : 0
            }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 30
            }}
          />
        </button>
      </label>
    </div>
  );
};

export default Toggle;

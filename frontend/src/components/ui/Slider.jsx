/**
 * Component: Slider
 * Premium slider control for speech rate
 */

import React from 'react';
import './Slider.css';

const Slider = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  valueFormat,
  disabled = false,
  className = '',
  ...props
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  const displayValue = valueFormat ? valueFormat(value) : value;

  return (
    <div className={`slider-wrapper ${disabled ? 'slider-disabled' : ''} ${className}`}>
      {(label || showValue) && (
        <div className="slider-header">
          {label && <label className="slider-label">{label}</label>}
          {showValue && <span className="slider-value">{displayValue}</span>}
        </div>
      )}
      <div className="slider-track-wrapper">
        <input
          type="range"
          className="slider"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          style={{
            '--slider-progress': `${percentage}%`
          }}
          {...props}
        />
      </div>
    </div>
  );
};

export default Slider;

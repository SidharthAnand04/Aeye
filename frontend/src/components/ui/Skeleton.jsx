/**
 * Component: Skeleton
 * Loading placeholder with shimmer effect
 */

import React from 'react';
import './Skeleton.css';

const Skeleton = ({
  width,
  height,
  variant = 'rect', // rect, circle, text
  className = '',
  style = {},
  ...props
}) => {
  const classes = [
    'skeleton',
    `skeleton-${variant}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{
        width,
        height,
        ...style
      }}
      aria-hidden="true"
      {...props}
    />
  );
};

// Text Skeleton (for multiple lines)
export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div className={`skeleton-text-container ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        variant="text"
        width={i === lines - 1 ? '75%' : '100%'}
      />
    ))}
  </div>
);

// Card Skeleton
export const SkeletonCard = ({ className = '' }) => (
  <div className={`skeleton-card ${className}`}>
    <Skeleton variant="rect" height={160} />
    <div className="skeleton-card-content">
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="100%" />
      <Skeleton variant="text" width="80%" />
    </div>
  </div>
);

// Avatar Skeleton
export const SkeletonAvatar = ({ size = 40, className = '' }) => (
  <Skeleton 
    variant="circle" 
    width={size} 
    height={size}
    className={className}
  />
);

// Person Card Skeleton
export const SkeletonPersonCard = ({ className = '' }) => (
  <div className={`skeleton-person-card ${className}`}>
    <SkeletonAvatar size={48} />
    <div className="skeleton-person-info">
      <Skeleton variant="text" width="50%" />
      <Skeleton variant="text" width="70%" height={12} />
    </div>
  </div>
);

export default Skeleton;

/**
 * Component: Card
 * Premium card with hover effects and variants
 */

import React from 'react';
import { motion } from 'framer-motion';
import './Card.css';

const Card = React.forwardRef(({
  children,
  variant = 'default', // default, elevated, bordered, interactive
  padding = 'md',      // none, sm, md, lg
  className = '',
  onClick,
  as = 'div',
  ...props
}, ref) => {
  const Component = onClick ? motion.button : motion[as] || motion.div;
  
  const classes = [
    'card',
    `card-${variant}`,
    `card-padding-${padding}`,
    onClick && 'card-clickable',
    className
  ].filter(Boolean).join(' ');

  const motionProps = onClick ? {
    whileHover: { y: -2, boxShadow: '0 12px 24px -8px rgba(0, 0, 0, 0.1)' },
    whileTap: { scale: 0.99 },
    transition: { duration: 0.2, ease: 'easeOut' }
  } : {};

  return (
    <Component
      ref={ref}
      className={classes}
      onClick={onClick}
      {...motionProps}
      {...props}
    >
      {children}
    </Component>
  );
});

Card.displayName = 'Card';

// Card Header
export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`card-header ${className}`} {...props}>
    {children}
  </div>
);

// Card Content
export const CardContent = ({ children, className = '', ...props }) => (
  <div className={`card-content ${className}`} {...props}>
    {children}
  </div>
);

// Card Footer
export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`card-footer ${className}`} {...props}>
    {children}
  </div>
);

// Feature Card (for landing page)
export const FeatureCard = ({ icon, title, description, className = '' }) => (
  <motion.div 
    className={`feature-card ${className}`}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, ease: 'easeOut' }}
  >
    <div className="feature-card-icon">{icon}</div>
    <h3 className="feature-card-title">{title}</h3>
    <p className="feature-card-description">{description}</p>
  </motion.div>
);

export default Card;

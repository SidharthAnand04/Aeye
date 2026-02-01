/**
 * Layout Components
 * Shell, Header, Footer for consistent page structure
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, Menu, X } from 'lucide-react';
import { IconButton } from '../ui';
import './Layout.css';

// Navigation Links
const navLinks = [
  { path: '/', label: 'Home' },
  { path: '/vision', label: 'Live Camera' },
  { path: '/media', label: 'Upload Media' },
  { path: '/people', label: 'People & Text' },
];

// Header Component
export const Header = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="header glass">
      <div className="header-container">
        {/* Logo */}
        <Link to="/" className="header-logo">
          <div className="logo-icon">
            <Eye size={24} />
          </div>
          <span className="logo-text">Aeye</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="header-nav" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`nav-link ${location.pathname === link.path ? 'nav-link-active' : ''}`}
            >
              {link.label}
              {location.pathname === link.path && (
                <motion.div
                  className="nav-link-indicator"
                  layoutId="nav-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </Link>
          ))}
        </nav>

        {/* Mobile Menu Toggle */}
        <IconButton
          icon={mobileMenuOpen ? <X /> : <Menu />}
          label="Toggle menu"
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <motion.nav
          className="mobile-nav"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`mobile-nav-link ${location.pathname === link.path ? 'mobile-nav-link-active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </motion.nav>
      )}
    </header>
  );
};

// Footer Component
export const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-brand">
          <div className="footer-logo">
            <Eye size={20} />
            <span>Aeye</span>
          </div>
          <p className="footer-tagline">Assistive Vision for Everyone</p>
        </div>
        
        <div className="footer-links">
          <Link to="/" className="footer-link">Home</Link>
          <Link to="/vision" className="footer-link">Vision Assist</Link>
          <Link to="/people" className="footer-link">People & Text</Link>
        </div>

        <div className="footer-privacy">
          <p className="privacy-note">
            🔒 Privacy First: No raw video frames are stored by default. 
            All processing happens in real-time.
          </p>
        </div>

        <div className="footer-copyright">
          <p>© 2026 Aeye. Built for accessibility.</p>
        </div>
      </div>
    </footer>
  );
};

// Main Layout Shell
const Layout = ({ children }) => {
  return (
    <div className="layout">
      <Header />
      <main className="layout-main">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;

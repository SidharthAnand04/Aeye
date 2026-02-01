/**
 * Aeye - Real-time Assistive Vision Application
 * 
 * A sleek, modern, OpenAI-inspired UI with premium animations
 * and smooth page transitions.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

// Styles
import './styles/tokens.css';

// Layout
import { Layout } from './components/layout';

// Pages
import { LandingPage, VisionPage, PeoplePage, MediaPage } from './pages';

// Providers
import { ToastProvider } from './components/ui';

// Animated Routes Wrapper
const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/vision" element={<VisionPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/media" element={<MediaPage />} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Layout>
          <AnimatedRoutes />
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;

/**
 * Landing Page
 * Hero, features, how it works, and CTA sections
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Eye, 
  Users, 
  Type, 
  Mic, 
  Camera, 
  Brain, 
  Volume2,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  Upload
} from 'lucide-react';
import PageTransition from '../../components/layout/PageTransition';
import { Button, FeatureCard } from '../../components/ui';
import './LandingPage.css';

const LandingPage = () => {
  const features = [
    {
      icon: <Eye />,
      title: 'Real-time Vision',
      description: 'Instant scene understanding with AI-powered object detection and spatial awareness.',
    },
    {
      icon: <Users />,
      title: 'Face Recognition',
      description: 'Remember people you meet and track conversation history automatically.',
    },
    {
      icon: <Type />,
      title: 'Text Reading',
      description: 'OCR-powered text extraction and natural reading for signs, documents, and more.',
    },
    {
      icon: <Mic />,
      title: 'Voice Interaction',
      description: 'Hands-free operation with speech recognition and natural voice output.',
    },
    {
      icon: <Brain />,
      title: 'Context Aware',
      description: 'Intelligent mode switching based on what matters in the moment.',
    },
    {
      icon: <Shield />,
      title: 'Privacy First',
      description: 'No video storage by default. Your visual data stays private.',
    },
  ];

  const steps = [
    {
      number: '01',
      icon: <Camera />,
      title: 'Point Your Camera',
      description: 'Simply point your device camera at what you want to understand.',
    },
    {
      number: '02',
      icon: <Sparkles />,
      title: 'AI Analyzes the Scene',
      description: 'Our vision AI instantly processes the scene, detecting objects, text, and faces.',
    },
    {
      number: '03',
      icon: <Volume2 />,
      title: 'Hear Natural Descriptions',
      description: 'Receive clear, contextual audio descriptions of your surroundings.',
    },
  ];

  return (
    <PageTransition className="landing-page">
      {/* Hero Section */}
      <section className="hero bg-mesh">
        <div className="hero-container">
          <motion.div 
            className="hero-content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="hero-badge">
              <Zap size={14} />
              <span>AI-Powered Assistive Vision</span>
            </div>
            
            <h1 className="hero-title">
              See the World,
              <br />
              <span className="hero-title-accent">Hear the Story</span>
            </h1>
            
            <p className="hero-description">
              Aeye transforms visual information into natural, spoken descriptions. 
              Real-time scene understanding, face recognition, and text reading — 
              all in one accessible platform.
            </p>

            <div className="hero-actions">
              <Link to="/vision">
                <Button size="lg" icon={<Eye />}>
                  Live Camera
                </Button>
              </Link>
              <Link to="/media">
                <Button size="lg" variant="secondary" icon={<Upload />}>
                  Upload Media
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div 
            className="hero-visual"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          >
            <div className="hero-visual-frame">
              <div className="hero-visual-screen">
                <div className="hero-visual-icon">
                  <Eye size={64} />
                </div>
                <div className="hero-visual-pulse" />
                <div className="hero-visual-pulse hero-visual-pulse-delayed" />
              </div>
              <div className="hero-visual-glow" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-container">
          <motion.div 
            className="section-header"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="section-title">Powerful Features</h2>
            <p className="section-description">
              Everything you need for visual assistance, thoughtfully designed for accessibility.
            </p>
          </motion.div>

          <div className="features-grid">
            {features.map((feature, index) => (
              <FeatureCard
                key={index}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section bg-mesh">
        <div className="section-container">
          <motion.div 
            className="section-header"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="section-title">How It Works</h2>
            <p className="section-description">
              Three simple steps to visual understanding.
            </p>
          </motion.div>

          <div className="steps-grid">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                className="step-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
              >
                <div className="step-number">{step.number}</div>
                <div className="step-icon">{step.icon}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-description">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="section-container">
          <motion.div 
            className="cta-card"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="cta-title">Ready to Get Started?</h2>
            <p className="cta-description">
              Experience the power of AI-assisted vision. No setup required.
            </p>
            <Link to="/vision">
              <Button size="lg" icon={<ArrowRight />} iconPosition="right">
                Launch Vision Assist
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </PageTransition>
  );
};

export default LandingPage;

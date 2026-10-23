import React, { useState } from 'react';
import { LandingNavbar } from './landing/LandingNavbar';
import { LandingHero } from './landing/LandingHero';
import { LogoMarquee } from './landing/LogoMarquee';
import { BentoFeatures } from './landing/BentoFeatures';
import { InteractiveTabs } from './landing/InteractiveTabs';
import { FaqSection } from './landing/FaqSection';
import { AuthModal } from './landing/AuthModal';

export interface FolioLandingViewProps {
  onLogin: (role: 'SM' | 'AOM' | 'Admin') => void;
}

export const FolioLandingView: React.FC<FolioLandingViewProps> = ({ onLogin }) => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden bg-background text-foreground antialiased folio-landing">
      <LandingNavbar onOpenAuthModal={() => setIsAuthOpen(true)} />
      <main>
        <LandingHero onOpenAuthModal={() => setIsAuthOpen(true)} />
        <LogoMarquee />
        <BentoFeatures />
        <InteractiveTabs />
        <FaqSection />
      </main>
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSelectRole={(role) => {
          setIsAuthOpen(false);
          onLogin(role);
        }}
      />
    </div>
  );
};

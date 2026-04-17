'use client'; // Required if using Next.js App Router

import { useState, useEffect } from 'react';

export default function SmartAppBanner() {
  const [isVisible, setIsVisible] = useState(false);
const [os, setOs] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    // 1. Check if they already dismissed this banner
    const isDismissed = localStorage.getItem('appBannerDismissed');
    if (isDismissed === 'true') return;

    // 2. Modern OS Detection (No legacy Opera or MSStream checks)
    const userAgent = navigator.userAgent || navigator.vendor;
    
    if (/android/i.test(userAgent)) {
      setOs('android');
      setIsVisible(true);
    } else if (/iPad|iPhone|iPod/.test(userAgent)) {
      setOs('ios');
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    // Save to local storage so it doesn't show up on every single page load
    localStorage.setItem('appBannerDismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  // Set the correct store links based on OS
  const storeLink = os === 'ios' 
    ? 'https://apps.apple.com/us/app/YOUR-APP-ID' // Update this later
    : 'https://play.google.com/store/apps/details?id=com.invitoinbox.app';

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '100%',
      backgroundColor: '#ffffff',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      zIndex: 9999
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          onClick={handleDismiss}
          style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '0 8px' }}
        >
          ✕
        </button>
        {/* Replace this div with your actual App Icon */}
        <div style={{ width: '40px', height: '40px', backgroundColor: '#e2e8f0', borderRadius: '8px' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#000' }}>Invito Inbox</span>
          <span style={{ fontSize: '12px', color: '#666' }}>Get the free mobile app</span>
        </div>
      </div>
      
      <a 
        href={storeLink}
        style={{
          backgroundColor: '#000000',
          color: '#ffffff',
          padding: '8px 16px',
          borderRadius: '20px',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 'bold'
        }}
      >
        View
      </a>
    </div>
  );
}
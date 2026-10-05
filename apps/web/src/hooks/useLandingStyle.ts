import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { apiFetch } from '../lib/api.js';
import { resolveLandingStyle, LandingStyle, LANDING_STYLE_EVENT } from '../lib/landingStyle.js';

export function useLandingStyle() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStyle, setCurrentStyle] = useState<LandingStyle>(() => resolveLandingStyle(user));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentStyle(resolveLandingStyle(user));
  }, [user]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<LandingStyle>).detail;
      if (detail === 'basic' || detail === 'advanced') {
        setCurrentStyle(detail);
      } else {
        setCurrentStyle(resolveLandingStyle(user));
      }
    };
    window.addEventListener(LANDING_STYLE_EVENT, handleUpdate);
    return () => window.removeEventListener(LANDING_STYLE_EVENT, handleUpdate);
  }, [user]);

  const setLandingStyle = useCallback(async (next: LandingStyle, shouldNavigate: boolean = true) => {
    if (isSaving) return;
    setIsSaving(true);

    // 1. Immediate local & global reactive update
    try {
      localStorage.setItem('landing_style', next);
    } catch {}
    setCurrentStyle(next);
    window.dispatchEvent(new CustomEvent(LANDING_STYLE_EVENT, { detail: next }));

    // 2. Navigate to root if requested or if switching from a different app shell
    if (shouldNavigate) {
      if (location.pathname !== '/') {
        navigate('/');
      }
    }

    // 3. Persist to user profile on the backend
    try {
      const res = await apiFetch('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ profile: { landing_style: next } })
      });
      if (res?.user && updateUser) {
        updateUser(res.user);
      }
    } catch (err) {
      console.error('Failed to save landing style preference:', err);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, location.pathname, navigate, updateUser]);

  const toggleLandingStyle = useCallback(() => {
    const next = currentStyle === 'basic' ? 'advanced' : 'basic';
    return setLandingStyle(next, true);
  }, [currentStyle, setLandingStyle]);

  return {
    landingStyle: currentStyle,
    isAgentic: currentStyle === 'basic',
    setLandingStyle,
    toggleLandingStyle,
    isSaving,
  };
}

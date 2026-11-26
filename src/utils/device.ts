import { useEffect, useState } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isPortrait: boolean;
}

export function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  return uaMobile || (coarsePointer && hasTouch);
}

export function useDeviceInfo(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(() => ({
    isMobile: detectMobileDevice(),
    isPortrait: typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false,
  }));

  useEffect(() => {
    const update = () => {
      setInfo({
        isMobile: detectMobileDevice(),
        isPortrait: window.innerHeight > window.innerWidth,
      });
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return info;
}

'use client';

import { useEffect, useRef, useState } from 'react';

interface QrScannerProps {
  onDetected: (token: string) => void;
}

/**
 * Camera-based QR scanning using the native BarcodeDetector API where the
 * browser supports it (modern Chrome/Android). Where it isn't available, the
 * caller should offer manual membership-ID / search entry instead — we never
 * fake a scan result.
 */
export function QrScanner({ onDetected }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);

    let stream: MediaStream | null = null;
    let rafId: number;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onDetected(codes[0].rawValue);
              return;
            }
          } catch {
            // transient decode failure — keep scanning
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch {
        setCameraError('Camera access was denied or is unavailable on this device.');
      }
    })();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (supported === false) {
    return (
      <p className="rounded-md bg-warning-50 p-3 text-sm text-warning-700">
        Camera QR scanning isn&apos;t supported on this browser. Use membership ID or search below
        instead.
      </p>
    );
  }

  if (cameraError) {
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{cameraError}</p>;
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-slate-300 bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-3/5 w-3/5" aria-hidden="true">
          <span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-lg border-l-4 border-t-4 border-brand-400" />
          <span className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-lg border-r-4 border-t-4 border-brand-400" />
          <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-lg border-b-4 border-l-4 border-brand-400" />
          <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-lg border-b-4 border-r-4 border-brand-400" />
        </div>
      </div>
    </div>
  );
}

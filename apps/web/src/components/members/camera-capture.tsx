'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, SwitchCamera, X } from 'lucide-react';
import { Button } from '../ui/button';

interface CameraCaptureProps {
  open: boolean;
  onCancel: () => void;
  onUsePhoto: (file: File) => void;
}

type FacingMode = 'user' | 'environment';

/**
 * Live photo capture — NOT facial recognition. This only captures a still
 * frame from the camera for the member's profile photo, identical in kind
 * to a phone camera app; no face detection/matching happens anywhere here.
 */
export function CameraCapture({ open, onCancel, onUsePhoto }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [starting, setStarting] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startCamera(mode: FacingMode) {
    setError(null);
    setStarting(true);
    stopStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera capture is not supported in this browser. Please upload a photo instead.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitchCamera(devices.filter((d) => d.kind === 'videoinput').length > 1);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera permission was denied. Allow camera access, or upload a photo instead.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera was found on this device. Please upload a photo instead.');
      } else {
        setError('The camera is unavailable right now. Please upload a photo instead.');
      }
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setCapturedPreview(null);
    setCapturedFile(null);
    startCamera(facingMode);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      if (capturedPreview) URL.revokeObjectURL(capturedPreview);
    };
  }, [capturedPreview]);

  function switchCamera() {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    startCamera(next);
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `member-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedFile(file);
        setCapturedPreview(URL.createObjectURL(blob));
        stopStream();
      },
      'image/jpeg',
      0.92,
    );
  }

  function retake() {
    setCapturedPreview(null);
    setCapturedFile(null);
    startCamera(facingMode);
  }

  function usePhoto() {
    if (!capturedFile) return;
    onUsePhoto(capturedFile);
  }

  function handleCancel() {
    stopStream();
    onCancel();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={handleCancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-capture-title"
        className="relative w-full max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="camera-capture-title" className="font-heading text-base font-semibold text-slate-900">
            Take Live Photo
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close camera"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <div role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : capturedPreview ? (
          <div className="overflow-hidden rounded-md border border-slate-300 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={capturedPreview} alt="Captured preview" className="aspect-square w-full object-cover" />
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-md border border-slate-300 bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                Starting camera…
              </div>
            )}
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        <div className="mt-4 flex items-center justify-between gap-2">
          <div>
            {!error && !capturedPreview && canSwitchCamera && (
              <Button type="button" variant="ghost" size="sm" onClick={switchCamera}>
                <SwitchCamera className="h-4 w-4" aria-hidden="true" />
                Switch Camera
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            {error ? null : capturedPreview ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={retake}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retake
                </Button>
                <Button type="button" size="sm" onClick={usePhoto}>
                  Use Photo
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={capture} disabled={starting}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                Capture
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

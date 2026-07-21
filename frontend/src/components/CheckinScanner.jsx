import { useState, useEffect, useRef } from 'react';

/**
 * Webcam QR scanner using the browser's native BarcodeDetector (Chrome/Edge/
 * Android). Falls back to a message where unsupported — the host can still use
 * the manual check-in buttons. Calls onDetected(ticketId) for each new scan.
 */
const CheckinScanner = ({ onDetected, onClose }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastRef = useRef({ value: '', at: 0 });
  const [error, setError] = useState('');
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let detector;

    (async () => {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanLoop(detector);
      } catch (e) {
        setError('Could not access the camera. Check permissions, or use manual check-in.');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  const scanLoop = async (detector) => {
    if (!videoRef.current || videoRef.current.readyState !== 4) {
      rafRef.current = requestAnimationFrame(() => scanLoop(detector));
      return;
    }
    try {
      const codes = await detector.detect(videoRef.current);
      if (codes && codes.length > 0) {
        const value = codes[0].rawValue;
        const now = Date.now();
        // Debounce: ignore the same code within 3 seconds
        if (value && (value !== lastRef.current.value || now - lastRef.current.at > 3000)) {
          lastRef.current = { value, at: now };
          onDetected(value);
        }
      }
    } catch {
      // detect() can throw intermittently; keep looping
    }
    rafRef.current = requestAnimationFrame(() => scanLoop(detector));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg overflow-hidden max-w-md w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Scan guest QR</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {!supported ? (
          <div className="p-8 text-center text-gray-600">
            Your browser doesn't support in-browser scanning. Use the mobile app to scan, or
            check guests in manually from the list.
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : (
          <div className="relative bg-black">
            <video ref={videoRef} className="w-full" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-4 border-white/80 rounded-2xl" />
            </div>
          </div>
        )}

        <div className="px-4 py-3 text-center text-sm text-gray-500">
          Point the camera at a guest's entry QR.
        </div>
      </div>
    </div>
  );
};

export default CheckinScanner;

'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (data: string) => void;
}

export default function QRScanner({ onScan }: Props) {
  const qrRegionId = 'qr-reader';
  const html5QrRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const startScanner = async () => {
      try {
        const qr = new Html5Qrcode(qrRegionId);
        html5QrRef.current = qr;

        await qr.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: 250,
          },
          (decodedText) => {
            console.log('✅ QR Code Scanned:', decodedText);
            onScan(decodedText);
            qr.stop(); // Stop after first scan
          },
          () => {
            // Ignore scan errors
          }
        );
      } catch (err) {
        console.error('Failed to start QR scanner:', err);
      }
    };

    startScanner();

    return () => {
      html5QrRef.current?.stop().then(() => {
        html5QrRef.current?.clear();
      });
    };
  }, [onScan]);

  return (
    <div className="w-full max-w-xs mx-auto border rounded-lg p-4 shadow">
      <h3 className="text-center font-semibold mb-2">Scan QR Code</h3>
      <div id={qrRegionId} className="w-full aspect-square" />
    </div>
  );
}

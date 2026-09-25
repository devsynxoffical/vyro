import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TryOnEngine,
  type CameraFacing,
  type EngineStatus,
} from './engine/TryOnEngine';
import {
  GLASSES_VARIANTS,
  PRODUCTS,
  RING_VARIANTS,
  WATCH_VARIANTS,
  getDefaultProduct,
  type Product,
  type ProductType,
} from './types';
import './TryOnViewer.css';

interface TryOnViewerProps {
  activeProduct: Product;
  onProductChange: (product: Product) => void;
}

function hintFor(type: ProductType, facing: CameraFacing): string {
  const back = facing === 'environment';
  switch (type) {
    case 'glasses':
      return back ? 'Point the back camera at your face' : 'Look at the camera';
    case 'necklace':
      return back ? 'Point the camera at your face and neck' : 'Keep your face in frame';
    case 'watch':
      return back ? 'Point the camera at your wrist' : 'Show your wrist to the camera';
    case 'ring':
      return back ? 'Point the camera at your ring finger' : 'Show your ring finger';
  }
}

export function TryOnViewer({ activeProduct, onProductChange }: TryOnViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TryOnEngine | null>(null);
  const productRef = useRef(activeProduct);
  const cameraFacingRef = useRef<CameraFacing>('user');

  const [status, setStatus] = useState<EngineStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [tracking, setTracking] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('user');
  const [switchingCamera, setSwitchingCamera] = useState(false);

  productRef.current = activeProduct;
  cameraFacingRef.current = cameraFacing;

  // Bumped on every (re)start and on unmount so late async results from a
  // superseded engine are ignored instead of clobbering the live one.
  const generationRef = useRef(0);

  const initEngine = useCallback(async () => {
    const videoElement = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!videoElement || !overlayCanvas) return;

    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current;

    engineRef.current?.destroy();
    setTracking(false);

    const engine = new TryOnEngine({
      onStatus: (s, msg) => {
        if (!isCurrent()) return;
        setStatus(s);
        setStatusMessage(msg ?? '');
      },
      onFps: () => {},
      onTracking: (value) => {
        if (isCurrent()) setTracking(value);
      },
    });
    engineRef.current = engine;

    try {
      await engine.init(
        { videoElement, overlayCanvas },
        { facingMode: cameraFacingRef.current },
      );
      if (!isCurrent()) return;
      engine.start();
      await engine.setProduct(productRef.current);
    } catch (err) {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
      if (isCurrent()) {
        setStatus('error');
        setStatusMessage(err instanceof Error ? err.message : 'Failed to start camera');
      }
    }
  }, []);

  useEffect(() => {
    void initEngine();
    return () => {
      generationRef.current++;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [initEngine]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setTracking(false);
    void engine.setProduct(activeProduct);
  }, [activeProduct]);

  const flipCamera = async () => {
    const next: CameraFacing = cameraFacing === 'user' ? 'environment' : 'user';
    if (switchingCamera || !engineRef.current) return;
    setSwitchingCamera(true);
    const previous = cameraFacing;
    setCameraFacing(next);
    try {
      await engineRef.current.switchCamera(next);
    } catch (err) {
      setCameraFacing(previous);
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to switch camera');
    } finally {
      setSwitchingCamera(false);
    }
  };

  const takeScreenshot = () => {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas || !video.videoWidth) return;

    const out = document.createElement('canvas');
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    if (cameraFacing === 'user') {
      ctx.save();
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0);
    }
    ctx.drawImage(overlayCanvas, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vyro-${activeProduct.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const hint = hintFor(activeProduct.type, cameraFacing);
  const ready = status === 'ready';

  return (
    <div className="tryon-app">
      <div className="tryon-stage">
        <video
          ref={videoRef}
          className={`tryon-stage__video ${cameraFacing === 'user' ? 'is-mirrored' : ''}`}
          playsInline
          autoPlay
          muted
        />
        <canvas ref={overlayCanvasRef} className="tryon-stage__overlay" />

        {status !== 'ready' && (
          <div className="tryon-stage__loader">
            {status === 'error' ? (
              <>
                <p>{statusMessage || 'Camera access required'}</p>
                <button type="button" className="tryon-btn tryon-btn--primary" onClick={() => void initEngine()}>
                  Allow camera & retry
                </button>
              </>
            ) : (
              <>
                <div className="tryon-spinner" />
                <p>{statusMessage || 'Starting virtual try-on…'}</p>
              </>
            )}
          </div>
        )}

        {ready && (
          <div className="tryon-stage__status" aria-live="polite">
            <span className={tracking ? 'is-on' : ''}>
              {tracking ? 'Tracking active' : 'Finding target…'}
            </span>
          </div>
        )}

        <div className="tryon-stage__actions">
          <button
            type="button"
            className="tryon-icon-btn"
            aria-label="Restart camera"
            disabled={!ready || switchingCamera}
            onClick={() => void initEngine()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 12a8 8 0 0113.7-5.7M20 12a8 8 0 01-13.7 5.7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M16 4h4v4M8 20H4v-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="tryon-btn tryon-btn--capture"
            disabled={!ready}
            onClick={takeScreenshot}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v10M8 11l4 4 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Take Screenshot
          </button>
          <button
            type="button"
            className="tryon-icon-btn"
            aria-label={cameraFacing === 'user' ? 'Use back camera' : 'Use front camera'}
            disabled={!ready || switchingCamera}
            onClick={() => void flipCamera()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 8h4l2-3h8l2 3h2v11H4V8z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {ready && <p className="tryon-stage__hint">{hint}</p>}
      </div>

      <div className="tryon-picker">
        <p className="tryon-picker__label">Select an accessory</p>
        <div className="tryon-rail" role="listbox" aria-label="Accessories">
          {PRODUCTS.map((product) => {
            const selected = activeProduct.id === product.id;
            return (
              <button
                key={product.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`tryon-tile ${selected ? 'is-selected' : ''}`}
                onClick={() => onProductChange(product)}
              >
                <img src={product.image} alt="" />
              </button>
            );
          })}
        </div>
        {(activeProduct.type === 'ring' && RING_VARIANTS.length > 1) ||
        (activeProduct.type === 'glasses' && GLASSES_VARIANTS.length > 1) ||
        (activeProduct.type === 'watch' && WATCH_VARIANTS.length > 1) ? (
          <p className="tryon-picker__meta">{activeProduct.name}</p>
        ) : null}
      </div>
    </div>
  );
}

export function getInitialTryOnProduct(): Product {
  return getDefaultProduct('watch');
}

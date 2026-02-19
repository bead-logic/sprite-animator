import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Wand2, Image as ImageIcon, Download, Play, Pause, Plus, Minus, ScanEye, FileVideo, Move } from 'lucide-react';

const App = () => {
  // State
  const [image, setImage] = useState(null);
  const [sheetSize, setSheetSize] = useState({ width: 0, height: 0 });
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(8); 
  const [zoom, setZoom] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);
  
  // Grid Config (Defines the centers/stride)
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(1);
  
  // Portal Config (Defines the View/Export size)
  const [portalWidth, setPortalWidth] = useState(0);
  const [portalHeight, setPortalHeight] = useState(0);

  // Cleaning Config
  const [bgTolerance, setBgTolerance] = useState(20); 
  const [autoCenter, setAutoCenter] = useState(true);
  const [exportCols, setExportCols] = useState(5);

  // Keep exportCols synced with input cols by default
  useEffect(() => {
    setExportCols(cols);
  }, [cols]);

  // Live Analysis State
  const [detectedMask, setDetectedMask] = useState(null);

  // References
  const animationRef = useRef(null);
  const lastTimeRef = useRef(0);
  const sourceCanvasRef = useRef(null);

  // Load GIF Library (gif.js)
  useEffect(() => {
    if (!window.GIF) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js';
        script.async = true;
        document.body.appendChild(script);
    }
  }, []);

  // 1. Initialize Portal Size when Grid Changes (Auto-detect stride)
  useEffect(() => {
    if (sheetSize.width > 0 && cols > 0) {
        const strideW = Math.floor(sheetSize.width / cols);
        const strideH = Math.floor(sheetSize.height / rows);
        // Only set defaults if 0 (first load) or massive grid change
        if (portalWidth === 0) {
            setPortalWidth(strideW);
            setPortalHeight(strideH);
        }
    }
  }, [sheetSize, cols, rows]);

  // Derived Calculations
  const strideW = sheetSize.width > 0 ? sheetSize.width / cols : 0;
  const strideH = sheetSize.height > 0 ? sheetSize.height / rows : 0;
  const totalFrames = cols * rows;

  const currentCol = currentFrame % cols;
  const currentRow = Math.floor(currentFrame / cols);

  // Calculate Viewport Position (Centered on Grid Cell)
  const cellCenterX = (currentCol * strideW) + (strideW / 2);
  const cellCenterY = (currentRow * strideH) + (strideH / 2);
  
  // Top-Left of the "Portal"
  const portalX = cellCenterX - (portalWidth / 2);
  const portalY = cellCenterY - (portalHeight / 2);

  const translateX = -Math.floor(portalX * zoom) || 0;
  const translateY = -Math.floor(portalY * zoom) || 0;

  // File Handler
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setSheetSize({ width: img.width, height: img.height });
        setImage(event.target.result);
        setCurrentFrame(0);
        
        // Reset defaults
        setPortalWidth(Math.floor(img.width / 5));
        setPortalHeight(img.height);
        
        if (img.width / 5 > 300) setZoom(0.5);
        
        // Draw to hidden canvas for analysis
        const cvs = document.createElement('canvas');
        cvs.width = img.width;
        cvs.height = img.height;
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        sourceCanvasRef.current = ctx;
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // --- HELPER: Isolate Sprite Logic ---
  const isolateSpritePixels = (ctx, startX, startY, w, h, toleranceVal, bgR, bgG, bgB) => {
    // Prevent out of bounds or zero dimensions
    const sx = Math.max(0, Math.floor(startX));
    const sy = Math.max(0, Math.floor(startY));
    const width = Math.max(1, Math.min(w, ctx.canvas.width - sx));
    const height = Math.max(1, Math.min(h, ctx.canvas.height - sy));

    const imageData = ctx.getImageData(sx, sy, width, height);
    const data = imageData.data;
    const tolerance = toleranceVal * 2.55;

    const isBg = (r, g, b, a) => {
       if (a < 20) return true;
       const dist = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2));
       return dist <= tolerance;
    };

    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    
    // Grid to track visited/solid pixels
    const grid = new Int8Array(width * height).fill(0);
    let seedX = -1, seedY = -1;
    let found = false;

    // Spiral search for seed
    for (let radius = 0; radius < Math.min(width, height) / 2; radius += 2) {
        for(let angle=0; angle<360; angle+=15) {
            const rad = angle * (Math.PI/180);
            const tx = Math.floor(centerX + radius * Math.cos(rad));
            const ty = Math.floor(centerY + radius * Math.sin(rad));
            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
                const idx = (ty * width + tx) * 4;
                if (!isBg(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
                    seedX = tx; seedY = ty; found = true; break;
                }
            }
        }
        if(found) break;
    }

    if (!found) return []; // Empty frame

    // Flood Fill
    const stack = [[seedX, seedY]];
    grid[seedY * width + seedX] = 1; 
    const keepPixels = []; // {x, y} relative to Portal

    while(stack.length > 0) {
        const [cx, cy] = stack.pop();
        keepPixels.push({x: cx, y: cy});

        const neighbors = [[0,1], [0,-1], [1,0], [-1,0]];
        for(let n of neighbors) {
            const nx = cx + n[0];
            const ny = cy + n[1];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const gIdx = ny * width + nx;
                if (grid[gIdx] === 0) {
                    const pIdx = (ny * width + nx) * 4;
                    if (!isBg(data[pIdx], data[pIdx+1], data[pIdx+2], data[pIdx+3])) {
                        grid[gIdx] = 1; 
                        stack.push([nx, ny]);
                    }
                }
            }
        }
    }
    return keepPixels;
  };

  // --- LIVE ANALYSIS EFFECT ---
  // Runs detection on the CURRENT FRAME whenever settings change
  useEffect(() => {
    if (!sourceCanvasRef.current || !image || portalWidth <= 0 || portalHeight <= 0) return;

    try {
        const ctx = sourceCanvasRef.current;
        const bgPixel = ctx.getImageData(0, 0, 1, 1).data;
        
        // Calculate Portal Position for current frame
        const cx = (currentCol * strideW) + (strideW / 2);
        const cy = (currentRow * strideH) + (strideH / 2);
        const px = cx - (portalWidth / 2);
        const py = cy - (portalHeight / 2);

        const pixels = isolateSpritePixels(
            ctx, px, py, portalWidth, portalHeight, 
            bgTolerance, bgPixel[0], bgPixel[1], bgPixel[2]
        );

        setDetectedMask(pixels.length > 0 ? pixels : null);
    } catch(e) {
        console.error("Live analysis error", e);
    }

  }, [currentFrame, bgTolerance, cols, rows, portalWidth, portalHeight, image, currentCol, currentRow, strideW, strideH]);


  // --- BATCH PROCESS (Smart Clean) ---
  const performSmartClean = () => {
    if (!sourceCanvasRef.current || portalWidth <= 0 || portalHeight <= 0) return;
    setIsProcessing(true);

    setTimeout(() => {
      try {
        const ctx = sourceCanvasRef.current;
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const bgPixel = ctx.getImageData(0, 0, 1, 1).data;
        
        const actualExportCols = Math.max(1, exportCols || cols);
        const actualExportRows = Math.ceil(totalFrames / actualExportCols);

        const newSheetW = Math.max(1, actualExportCols * portalWidth);
        const newSheetH = Math.max(1, actualExportRows * portalHeight);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = newSheetW;
        outCanvas.height = newSheetH;
        const outCtx = outCanvas.getContext('2d');
        const srcData = ctx.getImageData(0,0,w,h).data; // Read entire source once (optimization) but accessing via loops

        for (let i = 0; i < totalFrames; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);

            const outC = i % actualExportCols;
            const outR = Math.floor(i / actualExportCols);

            // 1. Define Source Portal
            const cx = (c * strideW) + (strideW / 2);
            const cy = (r * strideH) + (strideH / 2);
            const px = cx - (portalWidth / 2);
            const py = cy - (portalHeight / 2);

            // 2. Isolate Pixels within this Portal
            const pixels = isolateSpritePixels(ctx, px, py, portalWidth, portalHeight, bgTolerance, bgPixel[0], bgPixel[1], bgPixel[2]);

            // 3. Define Destination Cell
            const cellX = outC * portalWidth;
            const cellY = outR * portalHeight;

            const imgData = outCtx.createImageData(portalWidth, portalHeight);

            // --- Auto-Center Math ---
                let offsetX = 0;
                let offsetY = 0;
                
                if (autoCenter && pixels.length > 0) {
                    let minX = portalWidth, maxX = 0, minY = portalHeight, maxY = 0;
                    for (let p of pixels) {
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.y > maxY) maxY = p.y;
                    }
                    const spriteCenterX = minX + (maxX - minX) / 2;
                    const spriteCenterY = minY + (maxY - minY) / 2;
                    
                    // Calculate shift needed to move sprite center to portal center
                    offsetX = Math.floor((portalWidth / 2) - spriteCenterX);
                    offsetY = Math.floor((portalHeight / 2) - spriteCenterY);
                }

                // 4. Copy Valid Pixels 1:1 (or Auto-Centered)
                for (let p of pixels) {
                    const globalX = Math.floor(px + p.x);
                    const globalY = Math.floor(py + p.y);
                    
                    const destX = p.x + offsetX;
                    const destY = p.y + offsetY;
                    
                    if (globalX >= 0 && globalX < w && globalY >= 0 && globalY < h && 
                        destX >= 0 && destX < portalWidth && destY >= 0 && destY < portalHeight) {
                        
                        const srcIdx = (globalY * w + globalX) * 4;
                        const tgtIdx = (destY * portalWidth + destX) * 4;

                        imgData.data[tgtIdx] = srcData[srcIdx];     
                        imgData.data[tgtIdx+1] = srcData[srcIdx+1]; 
                        imgData.data[tgtIdx+2] = srcData[srcIdx+2]; 
                        imgData.data[tgtIdx+3] = srcData[srcIdx+3]; 
                    }
                }
                outCtx.putImageData(imgData, cellX, cellY);
        }

        setImage(outCanvas.toDataURL());
        setSheetSize({ width: newSheetW, height: newSheetH });
        setCols(actualExportCols);
        setRows(actualExportRows);
        setDetectedMask(null); 
        setBgTolerance(0); 
      } catch (e) {
          console.error("Smart Clean Error", e);
      } finally {
        setIsProcessing(false);
      }
    }, 100);
  };

  // --- EXPORT GIF ---
  const handleGifExport = async () => {
    if (!image || !window.GIF || portalWidth <= 0 || portalHeight <= 0) return;
    setIsExportingGif(true);

    try {
        // Create a Blob for the worker to bypass cross-origin issues with the CDN
        const workerBlob = new Blob([`importScripts('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js')`], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);

        const gif = new window.GIF({
            workers: 2,
            quality: 10,
            width: portalWidth,
            height: portalHeight,
            workerScript: workerUrl,
            transparent: 0x000000 // Helps detect alpha
        });

        const canvas = document.createElement('canvas');
        canvas.width = portalWidth;
        canvas.height = portalHeight;
        const ctx = canvas.getContext('2d');
        const imgObj = new Image();
        imgObj.src = image;
        
        await new Promise(resolve => { imgObj.onload = resolve; });

        // Generate Frame Array
        for (let i = 0; i < totalFrames; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            
            // Calculate source position (matches the Portal view)
            const cx = (c * strideW) + (strideW / 2);
            const cy = (r * strideH) + (strideH / 2);
            const px = cx - (portalWidth / 2);
            const py = cy - (portalHeight / 2);

            ctx.clearRect(0, 0, portalWidth, portalHeight);
            
            // Draw cropped frame
            ctx.drawImage(
                imgObj, 
                px, py, portalWidth, portalHeight, 
                0, 0, portalWidth, portalHeight
            );
            
            // disposal: 2 is KEY. It restores background (clears canvas) before next frame.
            gif.addFrame(ctx, {copy: true, delay: 1000/fps, disposal: 2});
        }

        gif.on('finished', (blob) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `animation_${portalWidth}x${portalHeight}.gif`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setIsExportingGif(false);
            URL.revokeObjectURL(workerUrl);
        });

        gif.render();

    } catch (e) {
        console.error(e);
        setIsExportingGif(false);
    }
  };

  // Animation Loop
  useEffect(() => {
    if (!isPlaying || !image || totalFrames <= 0) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const animate = (time) => {
      const deltaTime = time - lastTimeRef.current;
      const interval = 1000 / fps;

      if (deltaTime >= interval) {
        setCurrentFrame((prev) => (prev + 1) % totalFrames);
        lastTimeRef.current = time;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, fps, image, totalFrames]);

  // Mask Canvas Helper
  const MaskOverlay = useMemo(() => {
    if (!detectedMask || portalWidth <= 0 || portalHeight <= 0) return null;
    
    try {
        const cvs = document.createElement('canvas');
        cvs.width = portalWidth;
        cvs.height = portalHeight;
        const c = cvs.getContext('2d');
        const id = c.createImageData(portalWidth, portalHeight);
        
        for(let p of detectedMask) {
            const idx = (p.y * portalWidth + p.x) * 4;
            if (idx >= 0 && idx < id.data.length - 3) {
                id.data[idx] = 255;   // R
                id.data[idx+1] = 0;   // G
                id.data[idx+2] = 0;   // B
                id.data[idx+3] = 100; // Alpha (Red tint)
            }
        }
        c.putImageData(id, 0, 0);
        return cvs.toDataURL();
    } catch (e) {
        console.error("Mask overlay error", e);
        return null;
    }
  }, [detectedMask, portalWidth, portalHeight]);

  return (
    <div style={{ 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f4f4f7',
      minHeight: '100vh',
      padding: '16px',
      color: '#1a1a1a',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        background: '#fff',
        padding: '12px',
        borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>🧙‍♂️</span>
            <b style={{ fontSize: '18px' }}>SpriteMagic</b>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <label style={{
            backgroundColor: '#4f46e5',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <ImageIcon size={16} />
            Upload
            <input type="file" onChange={handleUpload} style={{ display: 'none' }} accept="image/*" />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        
        {/* PREVIEWER */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            height: '350px',
            backgroundColor: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
          }}>
            {image ? (
               // PORTAL VIEWPORT
               <div style={{
                  width: `${(portalWidth || 0) * zoom}px`,
                  height: `${(portalHeight || 0) * zoom}px`,
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                  border: '2px solid #3b82f6', 
               }}>
                  {/* SOURCE SHEET */}
                  <div style={{
                    width: `${sheetSize.width * zoom}px`,
                    height: `${sheetSize.height * zoom}px`,
                    backgroundImage: `url(${image})`,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    transform: `translate3d(${translateX}px, ${translateY}px, 0)`,
                    imageRendering: zoom >= 1 ? 'pixelated' : 'auto'
                  }} />

                  {/* RED MASK */}
                  {MaskOverlay && (
                      <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          backgroundImage: `url(${MaskOverlay})`,
                          backgroundSize: '100% 100%',
                          imageRendering: 'pixelated',
                          pointerEvents: 'none',
                          opacity: 0.8
                      }} />
                  )}
              </div>
            ) : (
              <div style={{ color: '#9ca3af', textAlign: 'center' }}>
                <p style={{ fontSize: '14px' }}>Upload a sprite sheet to begin</p>
              </div>
            )}
          </div>
          
          <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', backgroundColor: '#fff' }}>
             <button onClick={() => setIsPlaying(!isPlaying)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#4b5563' }}>{isPlaying ? <Pause /> : <Play />}</button>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#6b7280' }}>SPEED</span>
                <input type="range" min="1" max="24" value={fps} onChange={(e) => setFps(parseInt(e.target.value) || 1)} style={{ width: '80px' }} />
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#6b7280' }}>ZOOM</span>
                <button onClick={() => setZoom(Math.max(0.1, zoom - 0.2))} style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 6px' }}><Minus size={12}/></button>
                <button onClick={() => setZoom(Math.min(5, zoom + 0.2))} style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 6px' }}><Plus size={12}/></button>
             </div>
          </div>
        </div>

        {/* CONTROLS */}
        {image && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '16px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
                <ScanEye size={18} className="text-indigo-600" color="#4f46e5" />
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>Frame & Clean</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* 1. Grid Config */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', marginBottom: '4px' }}>COLUMNS</label>
                        <input type="number" min="1" value={cols} onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', marginBottom: '4px' }}>ROWS</label>
                        <input type="number" min="1" value={rows} onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                    </div>
                </div>

                {/* 2. Portal Size */}
                <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '8px', border: '1px solid #b9e6fe' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>
                        PORTAL SIZE (Blue Box)
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280' }}>WIDTH</label>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0369a1' }}>{portalWidth}px</span>
                        </div>
                        <input type="range" min={1} max={Math.max(1, Math.floor(strideW * 3))} value={portalWidth || 1} onChange={(e) => setPortalWidth(parseInt(e.target.value) || 1)} style={{ width: '100%', accentColor: '#0ea5e9' }} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280' }}>HEIGHT</label>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0369a1' }}>{portalHeight}px</span>
                        </div>
                        <input type="range" min={1} max={Math.max(1, Math.floor(strideH * 2))} value={portalHeight || 1} onChange={(e) => setPortalHeight(parseInt(e.target.value) || 1)} style={{ width: '100%', accentColor: '#0ea5e9' }} />
                    </div>
                    <p style={{ fontSize: '10px', color: '#0c4a6e', marginTop: '6px' }}>
                        Shrink to crop or expand until the full character stays inside the blue box.
                    </p>
                </div>

                {/* 3. Tolerance */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280' }}>CLEAN TOLERANCE (Red Tint)</label>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#ef4444' }}>{bgTolerance}%</span>
                    </div>
                    <input type="range" min="0" max="50" value={bgTolerance || 0} onChange={(e) => setBgTolerance(parseInt(e.target.value) || 0)} style={{ width: '100%', accentColor: '#ef4444', height: '4px' }} />
                </div>

                {/* Auto Center Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: '8px' }}>
                    <input 
                        type="checkbox" 
                        id="autoCenter" 
                        checked={autoCenter} 
                        onChange={(e) => setAutoCenter(e.target.checked)} 
                        style={{ width: '16px', height: '16px', accentColor: '#4f46e5' }}
                    />
                    <label htmlFor="autoCenter" style={{ fontSize: '12px', fontWeight: 'bold', color: '#4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Move size={14} /> Auto-Center Sprites (Fixes jitter)
                    </label>
                </div>

                {/* Export Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '4px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', marginBottom: '4px' }}>OUTPUT COLUMNS</label>
                        <input type="number" min="1" value={exportCols} onChange={(e) => setExportCols(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', marginBottom: '4px' }}>OUTPUT ROWS (Auto)</label>
                        <input type="number" disabled value={Math.ceil(totalFrames / (exportCols || cols))} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#e5e7eb', color: '#6b7280' }} />
                    </div>
                </div>

                {/* Main Action */}
                <button 
                    onClick={performSmartClean}
                    disabled={isProcessing}
                    style={{
                        backgroundColor: isProcessing ? '#e0e7ff' : '#4f46e5',
                        color: isProcessing ? '#a5b4fc' : 'white',
                        border: 'none',
                        padding: '12px',
                        borderRadius: '8px',
                        fontWeight: '600',
                        cursor: isProcessing ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'all 0.2s',
                        marginTop: '8px'
                    }}
                >
                    {isProcessing ? 'Processing...' : '✨ Create Clean Sheet'}
                </button>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button 
                        onClick={() => {
                            const link = document.createElement('a');
                            link.download = `cleaned_sprite.png`;
                            link.href = image;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }}
                        style={{
                            backgroundColor: '#ecfdf5',
                            color: '#047857',
                            border: '1px solid #a7f3d0',
                            padding: '10px',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <Download size={16} /> Save Sheet
                    </button>
                    
                     <button 
                        onClick={handleGifExport}
                        disabled={isExportingGif}
                        style={{
                            backgroundColor: isExportingGif ? '#f3e8ff' : '#9333ea',
                            color: isExportingGif ? '#c084fc' : 'white',
                            border: isExportingGif ? '1px solid #d8b4fe' : 'none',
                            padding: '10px',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: isExportingGif ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        {isExportingGif ? 'Rendering...' : <><FileVideo size={16} /> Export GIF</>}
                    </button>
                 </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;

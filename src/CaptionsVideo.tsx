import { Audio, OffthreadVideo, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import React from 'react';
import { loadFont as loadCairo } from '@remotion/google-fonts/Cairo';
import { loadFont as loadTajawal } from '@remotion/google-fonts/Tajawal';
import { loadFont as loadAlmarai } from '@remotion/google-fonts/Almarai';
import { loadFont as loadNotoKufi } from '@remotion/google-fonts/NotoKufiArabic';
import { loadFont as loadAlexandria } from '@remotion/google-fonts/Alexandria';
import { loadFont as loadChanga } from '@remotion/google-fonts/Changa';
import { loadFont as loadAmiri } from '@remotion/google-fonts/Amiri';
import { CaptionsData, CaptionSegment } from './types';

// Load Google Fonts with multiple weights for premium typography
const cairoFont = loadCairo('normal', { weights: ['400', '700', '900'], subsets: ['arabic'] });
const tajawalFont = loadTajawal('normal', { weights: ['400', '700', '900'], subsets: ['arabic'] });
const almaraiFont = loadAlmarai('normal', { weights: ['400', '700', '800'], subsets: ['arabic'] });
const notoKufiFont = loadNotoKufi('normal', { weights: ['400', '700', '900'], subsets: ['arabic'] });
const alexandriaFont = loadAlexandria('normal', { weights: ['400', '700', '900'], subsets: ['arabic'] });
const changaFont = loadChanga('normal', { weights: ['400', '700', '800'], subsets: ['arabic'] });
const amiriFont = loadAmiri('normal', { weights: ['400', '700'], subsets: ['arabic'] });

// Helper to convert hex to rgb for background opacity
const hexToRgb = (hex: string): string => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
};

// Ultra high-contrast 8-directional black outline and drop shadow
const outlineShadow = '3px 3px 0px #000000, -3px -3px 0px #000000, 3px -3px 0px #000000, -3px 3px 0px #000000, 3px 0px 0px #000000, -3px 0px 0px #000000, 0px 3px 0px #000000, 0px -3px 0px #000000, 0px 6px 15px rgba(0, 0, 0, 0.95)';
const noBgTextShadow = '2px 2px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000, 0px 4px 6px rgba(0, 0, 0, 0.8)';

// Helper for dynamic caption text styling with Stroke and Drop Shadow
const buildCaptionTextStyle = (
  color: string,
  strokeColor?: string,
  strokeWidth?: number,
  shadowColor?: string,
  shadowBlur?: number
): React.CSSProperties => {
  const hasStroke = typeof strokeWidth === 'number' && strokeWidth > 0;
  const hasShadow = typeof shadowBlur === 'number' && shadowBlur > 0;

  let textShadow = 'none';
  let strokeStyle: React.CSSProperties = {};

  if (hasStroke || hasShadow) {
    const sColor = strokeColor || '#000000';
    const shColor = shadowColor || '#000000';
    
    let strokePart = '';
    if (hasStroke && strokeWidth) {
      const sw = strokeWidth;
      strokePart = `${sw}px ${sw}px 0px ${sColor}, -${sw}px -${sw}px 0px ${sColor}, ${sw}px -${sw}px 0px ${sColor}, -${sw}px ${sw}px 0px ${sColor}, ${sw}px 0px 0px ${sColor}, -${sw}px 0px 0px ${sColor}, 0px ${sw}px 0px ${sColor}, 0px -${sw}px 0px ${sColor}`;
    }

    let shadowPart = '';
    if (hasShadow && shadowBlur) {
      shadowPart = `0px 6px ${shadowBlur}px ${shColor}`;
    }

    textShadow = [strokePart, shadowPart].filter(Boolean).join(', ') || 'none';
    if (hasStroke && strokeWidth) {
      strokeStyle = {
        WebkitTextStroke: `${strokeWidth}px ${sColor}`,
      };
    }
  }

  return {
    color,
    textShadow,
    ...strokeStyle,
  };
};

// ClassicAnimation component: traditional style with no motion, simple outline stroke
const ClassicAnimation: React.FC<{
  segment: CaptionSegment;
  currentTime: number;
  activeColor?: string;
  inactiveColor?: string;
  fontSize?: number;
  wordSpacing?: number;
  textShadow?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
}> = ({ segment, currentTime, activeColor, inactiveColor, fontSize = 50, wordSpacing = 25, textShadow = outlineShadow, strokeColor, strokeWidth, shadowColor, shadowBlur }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        justifyContent: 'center',
        columnGap: `${wordSpacing / 100}em`,
        fontSize: `${fontSize}px`,
        fontWeight: 900,
        lineHeight: 1.3,
      }}
    >
      {segment.words.map((w, index) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        const color = isActive ? (activeColor || '#FFFFFF') : (inactiveColor || '#FFFFFF');
        const computedStyle = buildCaptionTextStyle(color, strokeColor, strokeWidth, shadowColor, shadowBlur);

        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              ...computedStyle,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

// RevealAnimation component: word-level smooth pop/fade-up with subtle springy bounce (formerly named Slide)
const RevealAnimation: React.FC<{
  segment: CaptionSegment;
  currentTime: number;
  activeColor?: string;
  inactiveColor?: string;
  fontSize?: number;
  wordSpacing?: number;
  textShadow?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
}> = ({ segment, currentTime, activeColor, inactiveColor, fontSize = 50, wordSpacing = 25, textShadow = outlineShadow, strokeColor, strokeWidth, shadowColor, shadowBlur }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        justifyContent: 'center',
        columnGap: `${wordSpacing / 100}em`,
        fontSize: `${fontSize}px`,
        fontWeight: 900,
        lineHeight: 1.3,
      }}
    >
      {segment.words.map((w, index) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        const isPast = currentTime > w.end;
        const color = isActive ? (activeColor || '#FFFFFF') : (inactiveColor || '#FFFFFF');
        const computedStyle = buildCaptionTextStyle(color, strokeColor, strokeWidth, shadowColor, shadowBlur);
        
        let translateY = 0;
        let opacity = 1;
        
        if (isActive) {
          const activeDuration = currentTime - w.start;
          const progress = Math.min(1, activeDuration / 0.25); // Smooth 250ms slide duration
          
          // Easing function for cubic-bezier(0.3, 1.5, 0.5, 1) springy curve
          const easeOutBack = (x: number): number => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
          };
          
          const t = easeOutBack(progress);
          translateY = 15 * (1 - t);
          opacity = 1;
        } else if (!isPast) {
          // Future words: completely invisible and positioned lower
          translateY = 15;
          opacity = 0;
        }

        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              ...computedStyle,
              transform: `translateY(${translateY}px)`,
              opacity,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

// SlideAnimation component: REAL kinetic slide-up animation where the entire sentence slides up collectively with a smooth ease-out curve
const SlideAnimation: React.FC<{
  segment: CaptionSegment;
  currentTime: number;
  activeColor?: string;
  inactiveColor?: string;
  fontSize?: number;
  wordSpacing?: number;
  textShadow?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
}> = ({ segment, currentTime, activeColor, inactiveColor, fontSize = 50, wordSpacing = 25, textShadow = outlineShadow, strokeColor, strokeWidth, shadowColor, shadowBlur }) => {
  // Calculate slide-up progress for the entire sentence based on segment start time
  const activeDuration = currentTime - segment.start;
  const progress = Math.min(1, Math.max(0, activeDuration / 0.35)); // Smooth 350ms slide duration for the whole sentence
  
  // easeOutQuart: extremely smooth ease-out curve
  const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);
  const t = easeOutQuart(progress);
  const translateY = 100 * (1 - t);
  const opacity = progress === 0 ? 0 : 1; // Start at opacity 0, fade in immediately

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        justifyContent: 'center',
        columnGap: `${wordSpacing / 100}em`,
        fontSize: `${fontSize}px`,
        fontWeight: 900,
        lineHeight: 1.3,
        overflow: 'hidden',
        paddingTop: '0.1em',
        paddingBottom: '0.1em',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          whiteSpace: 'nowrap',
          columnGap: `${wordSpacing / 100}em`,
          transform: `translateY(${translateY}%)`,
          opacity,
        }}
      >
        {segment.words.map((w, index) => {
          const isActive = currentTime >= w.start && currentTime <= w.end;
          const color = isActive ? (activeColor || '#FFFFFF') : (inactiveColor || '#FFFFFF');
          const computedStyle = buildCaptionTextStyle(color, strokeColor, strokeWidth, shadowColor, shadowBlur);

          return (
            <span
              key={index}
              style={{
                display: 'inline-block',
                ...computedStyle,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// TikTok-style or Centered rectangular Title Overlay
const TitleOverlay: React.FC<{
  titleText: string;
  titleSubtext?: string;
  titleColor: string;
  titleBgColor: string;
  titleDuration: number;
  titleTop: number;
  titleStyle?: string;
  frame: number;
  fps: number;
  fontFamily: string;
}> = ({ titleText, titleSubtext, titleColor, titleBgColor, titleDuration, titleTop, titleStyle = 'tiktok-pill', frame, fps, fontFamily }) => {
  const endFrame = (titleDuration && titleDuration > 0) ? Math.ceil(titleDuration * fps) : 999999;
  if (endFrame < 999000 && frame > endFrame) return null;

  const inDur  = Math.min(14, Math.floor(fps * 0.42)); // ~0.42s in
  const outDur = Math.min(10, Math.floor(fps * 0.28)); // ~0.28s out

  // Fast start, smooth deceleration ease-out curve (cubic-bezier 0.16, 1, 0.3, 1)
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t: number) => Math.pow(t, 2);

  let opacity    = 1;
  let translateY = 0;
  let scale      = 1;
  let blurPx     = 0;

  if (frame < inDur) {
    const tProgress = frame / inDur;
    const t = easeOutCubic(tProgress);
    opacity    = t;
    if (titleStyle === 'split-contrast') {
      translateY = 45 * (1 - t);   // slide UP from bottom
      // Blur vanishes very fast (by 40% of the entrance duration)
      blurPx     = Math.max(0, 8 * (1 - tProgress * 2.5));
    } else if (titleStyle === 'centered-rect') {
      scale      = 0.7 + 0.3 * t; // pops in from 70% scale
      translateY = 15 * (1 - t);
    } else {
      scale      = 0.88 + 0.12 * t;
      translateY = 40 * (1 - t);   // slides UP from below
    }
  } else if (frame > endFrame - outDur) {
    const t = easeIn((endFrame - frame) / outDur);
    opacity    = t;
    translateY = -20 * (1 - t);  // drifts up slightly on exit
    scale      = 0.92 + 0.08 * t;
  }

  // Auto split logic for 'split-contrast' style (4 words limit for single line, >=5 splits into 2 lines with min 2 words in 2nd line)
  let splitLine1 = titleText;
  let splitLine2: string | null = null;

  if (titleStyle === 'split-contrast' && titleText) {
    const words = titleText.trim().split(/\s+/).filter(w => w);
    if (words.length <= 4) {
      splitLine1 = words.join(' ');
      splitLine2 = null;
    } else {
      let line2Count = 2;
      if (words.length >= 6) {
        line2Count = Math.floor(words.length / 2);
      }
      const line1Count = words.length - line2Count;
      splitLine1 = words.slice(0, line1Count).join(' ');
      splitLine2 = words.slice(line1Count).join(' ');
    }
  }

  const getSplitFontSize = (str: string) => {
    if (str.length <= 14) return '46px';
    if (str.length <= 20) return '40px';
    if (str.length <= 26) return '34px';
    return '30px';
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: `${titleTop}%`,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 15,
        pointerEvents: 'none',
        direction: 'rtl',
        gap: '0px',
        opacity,
        filter: blurPx > 0.1 ? `blur(${blurPx.toFixed(1)}px)` : 'none',
        transform: `translateY(${translateY}px) scale(${scale})`,
      }}
    >
      {titleStyle === 'split-contrast' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '88%',
            maxWidth: '560px',
            margin: '0 auto',
            boxShadow: '0 14px 40px rgba(0,0,0,0.75)',
            borderRadius: '4px',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Top Line: White BG, Black Text */}
          <div
            style={{
              background: '#FFFFFF',
              color: '#000000',
              fontFamily,
              fontWeight: 900,
              fontSize: getSplitFontSize(splitLine1),
              padding: '10px 18px',
              textAlign: 'center',
              lineHeight: 1.3,
              width: '100%',
              boxSizing: 'border-box',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {splitLine1}
          </div>

          {/* Bottom Line: Black BG, White Text (if 2nd line exists) */}
          {splitLine2 && (
            <div
              style={{
                background: '#000000',
                color: '#FFFFFF',
                fontFamily,
                fontWeight: 900,
                fontSize: getSplitFontSize(splitLine2),
                padding: '10px 18px',
                textAlign: 'center',
                lineHeight: 1.3,
                width: '100%',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {splitLine2}
            </div>
          )}
        </div>
      ) : (
        /* Standard Title Box */
        <div
          style={{
            background: titleBgColor,
            color: titleColor,
            fontFamily,
            fontWeight: 900,
            fontSize: titleStyle === 'centered-rect' ? '46px' : '42px',
            padding: titleStyle === 'centered-rect' ? '10px 22px' : '14px 32px',
            borderRadius: titleStyle === 'centered-rect' ? '0px' : '36px',
            boxShadow: '0 10px 36px rgba(0,0,0,0.65)',
            textAlign: 'center',
            maxWidth: '88%',
            lineHeight: 1.3,
            letterSpacing: '-0.5px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {titleText}
        </div>
      )}
    </div>
  );
};

export const CaptionsVideo: React.FC<CaptionsData> = ({
  audioPath,
  videoPath,
  segments,
  animationType = 'classic',
  activeColor = '#FFFFFF',
  inactiveColor = '#FFFFFF',
  leftLogo,
  rightLogo,
  fontSize = 50,
  bgColor = '#000000',
  bgOpacity = 86,
  syncOffset = 0.20,
  wordSpacing = 31,
  bgPadding = 8,
  showBg = true,
  captionTop = 65,
  fontFamily = 'thmanyah',
  customFontName,
  customFontBase64,
  strokeColor = '#000000',
  strokeWidth = 0,
  shadowColor = '#000000',
  shadowBlur = 0,
  showTitle = true,
  titleText = '',
  titleColor = '#FFFFFF',
  titleBgColor = '#000000',
  titleDuration = 3.0,
  titleTop = 12,
  titleStyle = 'tiktok-pill',
  titleSubtext = '',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Sync delay offset: Makes the captions appear snappier and sync perfectly with the voice
  const currentTime = frame / fps + syncOffset;

  // Resolve active font family
  let activeFontFamily = "'Thmanyah', sans-serif";
  if (fontFamily === 'cairo') {
    activeFontFamily = cairoFont.fontFamily;
  } else if (fontFamily === 'thmanyah') {
    activeFontFamily = "'Thmanyah', sans-serif";
  } else if (fontFamily === 'tajawal') {
    activeFontFamily = tajawalFont.fontFamily;
  } else if (fontFamily === 'almarai') {
    activeFontFamily = almaraiFont.fontFamily;
  } else if (fontFamily === 'noto-kufi') {
    activeFontFamily = notoKufiFont.fontFamily;
  } else if (fontFamily === 'alexandria') {
    activeFontFamily = alexandriaFont.fontFamily;
  } else if (fontFamily === 'changa') {
    activeFontFamily = changaFont.fontFamily;
  } else if (fontFamily === 'amiri') {
    activeFontFamily = amiriFont.fontFamily;
  } else if (fontFamily === 'custom' || customFontBase64) {
    activeFontFamily = `'${customFontName || 'CustomUploadedFont'}', sans-serif`;
  }

  // Find the active segment
  const activeSegmentIndex = segments.findIndex(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  const foundSegment =
    activeSegmentIndex !== -1 ? segments[activeSegmentIndex] : undefined;

  // Display segment continuously during its duration
  const activeSegment = foundSegment;

  const showBgBox = showBg && bgOpacity > 0;

  const bgBoxStyle: React.CSSProperties = showBgBox ? {
    background: `rgba(${hexToRgb(bgColor)}, ${bgOpacity / 100})`,
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    borderRadius: '4px',
    padding: `${bgPadding}px ${bgPadding * 2}px`,
    boxShadow: 'none',
    border: 'none',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '95%',
    whiteSpace: 'nowrap',
  } : {
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '95%',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0c0d14', // Premium dark background
        position: 'relative',
        fontFamily: activeFontFamily,
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 80px',
        overflow: 'hidden',
      }}
    >
      {/* Inject custom font face or local Thmanyah font face */}
      <style>{`
        @font-face {
          font-family: 'Thmanyah';
          src: url('${staticFile('fonts/thmanyahseriftext-Regular.woff2')}') format('woff2');
          font-weight: 400;
          font-style: normal;
        }
        @font-face {
          font-family: 'Thmanyah';
          src: url('${staticFile('fonts/thmanyahseriftext-Bold.woff2')}') format('woff2');
          font-weight: 700;
          font-style: normal;
        }
        ${customFontBase64 ? `
        @font-face {
          font-family: '${customFontName || 'CustomUploadedFont'}';
          src: url('${customFontBase64}');
          font-weight: normal;
          font-style: normal;
        }
        ` : ''}
      `}</style>
      {/* Background Video (if provided) */}
      {videoPath ? (
        <OffthreadVideo
          src={staticFile(videoPath)}
          volume={0}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 1,
          }}
        />
      ) : (
        <>
          {/* Decorative premium radial gradients ONLY for audio-only mode */}
          <div
            style={{
              position: 'absolute',
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(0,0,0,0) 70%)',
              top: '20%',
              left: '10%',
              zIndex: 3,
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '600px',
              height: '600px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, rgba(0,0,0,0) 70%)',
              bottom: '20%',
              right: '10%',
              zIndex: 3,
            }}
          />
        </>
      )}

      {/* Title Overlay (TikTok-style Suggested Title) */}
      {showTitle && titleText && (
        <TitleOverlay
          titleText={titleText}
          titleSubtext={titleSubtext}
          titleColor={titleColor}
          titleBgColor={titleBgColor}
          titleDuration={titleDuration}
          titleTop={titleTop}
          titleStyle={titleStyle}
          frame={frame}
          fps={fps}
          fontFamily={activeFontFamily}
        />
      )}

      {/* Top Logos Container */}
      <div
        style={{
          position: 'absolute',
          top: '80px',
          left: '80px',
          right: '80px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        {leftLogo ? (
          <img
            src={leftLogo.startsWith('data:') || leftLogo.startsWith('http') ? leftLogo : staticFile(leftLogo)}
            style={{
              maxHeight: '100px',
              maxWidth: '250px',
              objectFit: 'contain',
            }}
            alt="Left Logo"
          />
        ) : (
          <div />
        )}
        {rightLogo ? (
          <img
            src={rightLogo.startsWith('data:') || rightLogo.startsWith('http') ? rightLogo : staticFile(rightLogo)}
            style={{
              maxHeight: '100px',
              maxWidth: '250px',
              objectFit: 'contain',
            }}
            alt="Right Logo"
          />
        ) : (
          <div />
        )}
      </div>

      {audioPath && <Audio src={staticFile(audioPath)} />}

      {/* Centered captions container with RTL flow */}
      <div
        style={{
          position: 'absolute',
          top: `${captionTop}%`,
          left: 0,
          right: 0,
          textAlign: 'center',
          direction: 'rtl',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'center',
          transform: 'translateY(-50%)',
        }}
      >
        {activeSegment && (
          <div 
            key={activeSegmentIndex}
            style={bgBoxStyle}
          >
            {animationType === 'slide' ? (
              <SlideAnimation
                segment={activeSegment}
                currentTime={currentTime}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                fontSize={fontSize}
                wordSpacing={wordSpacing}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                shadowColor={shadowColor}
                shadowBlur={shadowBlur}
              />
            ) : animationType === 'reveal' ? (
              <RevealAnimation
                segment={activeSegment}
                currentTime={currentTime}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                fontSize={fontSize}
                wordSpacing={wordSpacing}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                shadowColor={shadowColor}
                shadowBlur={shadowBlur}
              />
            ) : (
              <ClassicAnimation
                segment={activeSegment}
                currentTime={currentTime}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                fontSize={fontSize}
                wordSpacing={wordSpacing}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                shadowColor={shadowColor}
                shadowBlur={shadowBlur}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

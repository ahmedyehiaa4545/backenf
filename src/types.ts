export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export interface CaptionsData {
  audioPath: string;
  videoPath?: string; // Optional background video path
  durationInSeconds: number;
  segments: CaptionSegment[];
  animationType?: 'reveal' | 'slide' | 'classic'; // Selection of animation styles
  activeColor?: string;
  inactiveColor?: string;
  leftLogo?: string;
  rightLogo?: string;
  fontSize?: number;
  bgColor?: string;
  bgOpacity?: number; // 0 to 100
  syncOffset?: number;
  wordSpacing?: number; // spacing between words (in em / 100)
  bgPadding?: number; // padding around the background box (in px)
  showBg?: boolean;
  captionTop?: number;
  fontFamily?: string;
  customFontName?: string;
  customFontBase64?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  showTitle?: boolean;
  titleText?: string;
  titleSubtext?: string;
  titleColor?: string;
  titleBgColor?: string;
  titleDuration?: number;
  titleTop?: number;
  titleStyle?: string;
  titleSubtext?: string;
}

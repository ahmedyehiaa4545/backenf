import { Composition } from 'remotion';
import { CaptionsVideo } from './CaptionsVideo';
import { CaptionsData } from './types';

const defaultProps: CaptionsData = {
  audioPath: 'audio.mp3',
  durationInSeconds: 5,
  animationType: 'classic',
  segments: [
    {
      start: 0,
      end: 2.5,
      text: "مرحباً بكم في تجربة ريموشن",
      words: [
        { word: "مرحباً", start: 0.1, end: 0.8 },
        { word: "بكم", start: 0.8, end: 1.2 },
        { word: "في", start: 1.2, end: 1.5 },
        { word: "تجربة", start: 1.5, end: 2.0 },
        { word: "ريموشن", start: 2.0, end: 2.5 }
      ]
    },
    {
      start: 2.5,
      end: 5.0,
      text: "الخطوط العربية تعمل بشكل رائع",
      words: [
        { word: "الخطوط", start: 2.6, end: 3.2 },
        { word: "العربية", start: 3.2, end: 3.8 },
        { word: "تعمل", start: 3.8, end: 4.2 },
        { word: "بشكل", start: 4.2, end: 4.6 },
        { word: "رائع", start: 4.6, end: 5.0 }
      ]
    }
  ]
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="CaptionsVideo"
      component={CaptionsVideo as any}
      durationInFrames={150} // Fallback duration (5 seconds)
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps as any}
      calculateMetadata={async ({ props }) => {
        console.log("DEBUG calculateMetadata props:", props);
        const duration = (props as any).durationInSeconds || 5;
        const durationInFrames = Math.ceil(duration * 30);
        console.log("DEBUG calculateMetadata durationInFrames:", durationInFrames);
        return {
          durationInFrames,
          props
        };
      }}
    />
  );
};

import { Config } from '@remotion/cli/config';

Config.setCodec('h264');
Config.setPixelFormat('yuv420p');

// This ensures HTML elements are properly formatted and allows flexible CSS layout.
Config.setAllowHtmlInCanvasEnabled(true);

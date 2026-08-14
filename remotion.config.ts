import { Config } from '@remotion/cli/config';

Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setConcurrency(5);
Config.setChromiumDisableWebSecurity(true);
Config.setChromiumOpenGlRenderer('swangle');
Config.setChromiumHeadlessMode(true);
Config.setOffthreadVideoCacheSizeInBytes(128 * 1024 * 1024);



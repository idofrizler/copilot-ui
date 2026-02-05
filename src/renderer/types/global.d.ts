import type { ElectronAPI } from '../../preload/preload';

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*/build-info.json' {
  const buildInfo: {
    version: string;
    baseVersion: string;
    buildTimestamp: string;
    buildDate: string;
    buildTime: string;
    gitSha: string;
    gitBranch: string;
    releaseNotes: string;
  };
  export default buildInfo;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};

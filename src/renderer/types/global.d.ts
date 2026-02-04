import type { ElectronAPI } from '../../preload/preload';

declare module '*.png' {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};

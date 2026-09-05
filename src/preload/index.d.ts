import type { RoyaleApi } from "./index";

declare global {
  interface Window {
    royale: RoyaleApi;
  }
}

export {};

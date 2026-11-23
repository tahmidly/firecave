import type { LocalClawApi } from "./types";

declare global {
  interface Window {
    localclaw?: LocalClawApi;
  }
}

export {};

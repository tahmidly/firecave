import { contextBridge, ipcRenderer } from "electron";
import type { LocalClawApi, RunMessage, SyncMessage } from "../shared/types";

const clientId = crypto.randomUUID();

const api: LocalClawApi = {
  clientId,
  platform: process.platform,
  getStatus: () => ipcRenderer.invoke("claude:status"),
  providersStatus: () => ipcRenderer.invoke("providers:status"),
  selectFolder: () => ipcRenderer.invoke("dialog:folder"),
  startRun: (opts) => ipcRenderer.invoke("claude:start", opts),
  cancelRun: (runId) => ipcRenderer.invoke("claude:cancel", runId),
  dbList: () => ipcRenderer.invoke("db:list"),
  dbSave: (c) => ipcRenderer.invoke("db:save", c, clientId),
  dbDelete: (id) => ipcRenderer.invoke("db:delete", id, clientId),
  busyList: () => ipcRenderer.invoke("claude:busy"),
  onSync: (cb) => {
    const h = (_: unknown, m: SyncMessage) => cb(m);
    ipcRenderer.on("sync:message", h);
    return () => ipcRenderer.removeListener("sync:message", h);
  },
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (k, v) => ipcRenderer.invoke("settings:set", k, v),
  fsList: (root, rel) => ipcRenderer.invoke("fs:list", root, rel),
  fsRead: (root, rel) => ipcRenderer.invoke("fs:read", root, rel),
  apiProvidersList: () => ipcRenderer.invoke("apiProviders:list"),
  apiProvidersSave: (p) => ipcRenderer.invoke("apiProviders:save", p),
  apiProvidersDelete: (id) => ipcRenderer.invoke("apiProviders:delete", id),
  pluginsList: () => ipcRenderer.invoke("plugins:list"),
  pluginsSave: (pl) => ipcRenderer.invoke("plugins:save", pl),
  pluginsDelete: (id) => ipcRenderer.invoke("plugins:delete", id),
  pluginsIsolate: (v) => ipcRenderer.invoke("plugins:isolate", v),
  setWindowTheme: (dark) => ipcRenderer.invoke("window:theme", dark),
  remoteGet: () => ipcRenderer.invoke("remote:get"),
  remoteSet: (cfg) => ipcRenderer.invoke("remote:set", cfg),
  remoteRegenerate: () => ipcRenderer.invoke("remote:regenerate"),
  onRunMessage: (cb) => {
    const h = (_: unknown, m: RunMessage) => cb(m);
    ipcRenderer.on("claude:message", h);
    return () => ipcRenderer.removeListener("claude:message", h);
  },
};

contextBridge.exposeInMainWorld("localclaw", api);

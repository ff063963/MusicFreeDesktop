import { ipcMainHandle, ipcMainOn } from "@/common/ipc-util/main";
import {
  closeLyricWindow,
  createLyricWindow,
  getLyricWindow,
  getMainWindow,
} from "../window";
import {
  BrowserWindow,
  MessageChannelMain,
  app,
  dialog,
  ipcRenderer,
  net,
  shell,
} from "electron";
import { currentMusicInfoStore } from "../store/current-music";
import { PlayerState } from "@/renderer/core/track-player/enum";
import { setupTrayMenu } from "../tray";
import axios from "axios";
import { compare } from "compare-versions";
import { getPluginByMedia } from "../core/plugin-manager";
import { encodeUrlHeaders } from "@/common/normalize-util";
import { getQualityOrder } from "@/common/media-util";
import { getAppConfigPath, setAppConfigPath } from "@/common/app-config/main";

let messageChannel: MessageChannelMain;

export default function setupIpcMain() {
  ipcMainOn("min-window", ({ skipTaskBar }) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (skipTaskBar) {
        mainWindow.hide();
        mainWindow.setSkipTaskbar(true);
      }
      mainWindow.minimize();
    }
  });

  ipcMainOn("open-url", (url) => {
    shell.openExternal(url);
  });

  ipcMainHandle("show-open-dialog", (options) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      throw new Error("Invalid Window");
    }
    return dialog.showOpenDialog(options);
  });

  ipcMainHandle("show-save-dialog", (options) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      throw new Error("Invalid Window");
    }
    return dialog.showSaveDialog(options);
  });

  ipcMainOn("exit-app", () => {
    app.exit(0);
  });

  ipcMainOn("sync-current-music", (musicItem) => {
    currentMusicInfoStore.setValue((prev) => ({
      ...prev,
      currentMusic: musicItem ?? null,
    }));
    setupTrayMenu();
  });

  ipcMainOn("sync-current-playing-state", (playerState) => {
    currentMusicInfoStore.setValue((prev) => ({
      ...prev,
      currentPlayerState: playerState ?? PlayerState.None,
    }));
    setupTrayMenu();
  });

  ipcMainOn("sync-current-repeat-mode", (repeatMode) => {
    currentMusicInfoStore.setValue((prev) => ({
      ...prev,
      currentRepeatMode: repeatMode,
    }));
    setupTrayMenu();
  });

  /** APP更新 */
  const updateSources = [
    "https://gitee.com/maotoumao/MusicFreeDesktop/raw/master/release/version.json",
    "https://raw.githubusercontent.com/maotoumao/MusicFreeDesktop/master/release/version.json",
  ];
  ipcMainHandle("check-update", async () => {
    const currentVersion = app.getVersion();
    const updateInfo: ICommon.IUpdateInfo = {
      version: currentVersion,
    };
    for (let i = 0; i < updateSources.length; ++i) {
      try {
        const rawInfo = (await axios.get(updateSources[i])).data;
        if (compare(rawInfo.version, currentVersion, ">")) {
          updateInfo.update = rawInfo;
          return updateInfo;
        }
      } catch {
        continue;
      }
    }
    return updateInfo;
  });

  /** 下载音乐 */
  ipcMainOn("download-media", async ({ mediaItem }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return;
    }

    const [defaultQuality, whenQualityMissing] = await Promise.all([
      getAppConfigPath("download.defaultQuality"),
      getAppConfigPath("download.whenQualityMissing"),
    ]);

    try {
      const qualityOrder = getQualityOrder(defaultQuality, whenQualityMissing);
      let mediaSource: IPlugin.IMediaSourceResult | null = null;
      let realQuality: IMusic.IQualityKey = qualityOrder[0];
      for (const quality of qualityOrder) {
        try {
          mediaSource = await getPluginByMedia(
            mediaItem
          )?.methods?.getMediaSource(mediaItem, quality);
          if (!mediaSource?.url) {
            continue;
          }
          realQuality = quality;
          break;
        } catch {}
      }

      const headers = mediaSource.headers ?? {};
      if (mediaSource.userAgent) {
        headers["user-agent"] = mediaSource.userAgent;
      }
      // const encodedUrl = encodeUrlHeaders(mediaSource.url, headers);
      // mainWindow.webContents.downloadURL(encodedUrl);
      mainWindow.webContents.session.downloadURL(mediaSource.url, {
        headers: mediaSource.headers,
      });
    } catch (e) {
      console.log(e);
    }
  });

  ipcMainHandle("set-lyric-window", (enabled) => {
    if (enabled) {
      let lyricWindow = getLyricWindow();
      if (!lyricWindow) {
        lyricWindow = createLyricWindow();
      }
    } else {
      closeLyricWindow();
    }
  });

  ipcMainOn("send-to-lyric-window", (data) => {
    const lyricWindow = getLyricWindow();
    if (!lyricWindow) {
      return;
    }

    lyricWindow.webContents.send("send-to-lyric-window", data);
  });

  ipcMainOn("set-desktop-lyric-lock", async (lockState) => {
    const result = await setAppConfigPath("lyric.lockLyric", lockState);

    if (result) {
      const lyricWindow = getLyricWindow();

      if (!lyricWindow) {
        return;
      }
      if (lockState) {
        lyricWindow.setIgnoreMouseEvents(true, {
          forward: true,
        });
      } else {
        lyricWindow.setIgnoreMouseEvents(false);
      }
    }
  });

  ipcMainOn("ignore-mouse-event", async (data) => {
    const targetWindow = data.window === 'main' ? getMainWindow(): getLyricWindow();
    if(!targetWindow) {
      return;
    }
    targetWindow.setIgnoreMouseEvents(data.ignore, {
      forward: true
    });
  });

  // ipcMainHandle('', () => {
  //   return messageChannel.port2;
  // })
}

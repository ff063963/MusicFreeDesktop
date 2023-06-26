import { ipcRendererInvoke } from "@/common/ipc-util/renderer";
import { compare } from "compare-versions";
import { showModal } from "../components/Modal";
import { getUserPerference } from "./user-perference";

export default async function checkUpdate(ignorePref?: boolean) {
  /** checkupdate */
  const updateInfo = await ipcRendererInvoke("check-update");
  console.log(updateInfo);
  if (updateInfo.update) {
    const skipVersion = getUserPerference("skipVersion");
    if (
      !ignorePref &&
      skipVersion &&
      compare(updateInfo.version, skipVersion, "<=")
    ) {
      return;
    }
    showModal("Update", {
      currentVersion: updateInfo.version,
      update: updateInfo.update,
    });
  }
}

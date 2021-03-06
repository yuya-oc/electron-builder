import BluebirdPromise from "bluebird-lst"
import { CONCURRENCY, FileCopier, Link, MAX_FILE_REQUESTS } from "electron-builder-util/out/fs"
import { ensureDir, readlink, symlink } from "fs-extra-p"
import * as path from "path"
import { Packager } from "../packager"
import { FileSet } from "./AppFileCopierHelper"
import { copyFileOrData } from "./asarUtil"
import { AsyncTaskManager } from "./asyncTaskManager"

export async function copyAppFiles(fileSet: FileSet, packager: Packager) {
  const metadata = fileSet.metadata
  const transformedFiles = fileSet.transformedFiles
  // search auto unpacked dir
  const unpackedDirs = new Set<string>()
  const taskManager = new AsyncTaskManager(packager.cancellationToken)
  const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)

  const fileCopier = new FileCopier()
  const links: Array<Link> = []
  for (let i = 0, n = fileSet.files.length; i < n; i++) {
    const file = fileSet.files[i]
    const stat = metadata.get(file)
    if (stat == null) {
      // dir
      continue
    }

    const relativePath = file.replace(fileSet.src, fileSet.destination)
    if (stat.isFile()) {
      const fileParent = path.dirname(file)
      // const dirNode = this.fs.getOrCreateNode(this.getRelativePath(fileParent))

      const newData = transformedFiles == null ? null : transformedFiles[i] as string | Buffer
      if (newData != null) {
        transformedFiles[i] = null
      }

      if (!dirToCreateForUnpackedFiles.has(fileParent)) {
        dirToCreateForUnpackedFiles.add(fileParent)
        await ensureDir(fileParent.replace(fileSet.src, fileSet.destination))
      }

      taskManager.addTask(copyFileOrData(fileCopier, newData, file, relativePath, stat))
      if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
        await taskManager.awaitTasks()
      }
    }
    else if (stat.isSymbolicLink()) {
      links.push({file: relativePath, link: await readlink(file)})
    }
  }

  if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
    await taskManager.awaitTasks()
  }
  if (links.length > 0) {
    BluebirdPromise.map(links, it => symlink(it.link, it.file), CONCURRENCY)
  }
}
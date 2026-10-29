// zip and folder import, zip export. everything stays in the browser
import { fileBytes, projectFromFiles, type Project } from './project'

export async function importZip(file: Blob, name: string): Promise<Project> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)
  const entries: { path: string; bytes: Uint8Array }[] = []
  const tasks: Promise<void>[] = []
  zip.forEach((path, entry) => {
    if (entry.dir || path.startsWith('__MACOSX/') || path.endsWith('.DS_Store')) return
    tasks.push(entry.async('uint8array').then((bytes) => void entries.push({ path, bytes })))
  })
  await Promise.all(tasks)
  if (!entries.length) throw new Error('The zip file is empty.')
  return projectFromFiles(name.replace(/\.zip$/i, ''), entries)
}

// files from <input webkitdirectory>, their webkitRelativePath starts with the chosen folder
export async function importFolder(files: File[]): Promise<Project> {
  if (!files.length) throw new Error('The folder is empty.')
  const top = files[0].webkitRelativePath.split('/')[0]
  const entries = await Promise.all(
    files
      .filter((f) => !f.name.startsWith('.DS_Store'))
      .map(async (f) => ({
        path: f.webkitRelativePath.slice(top.length + 1) || f.name,
        bytes: new Uint8Array(await f.arrayBuffer()),
      })),
  )
  return projectFromFiles(top, entries)
}

export async function exportZip(project: Project): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const file of Object.values(project.files)) {
    zip.file(file.path, fileBytes(file), { date: new Date(project.createdAt) })
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' })
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

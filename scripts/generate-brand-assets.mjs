import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const publicDir = path.join(repoRoot, "public")
const sourceSvg = path.join(publicDir, "tsv-boxgym-brand-mark.svg")
const workDir = mkdtempSync(path.join(tmpdir(), "tsv-boxgym-brand-assets-"))

const pngSizes = [16, 32, 48, 64, 180, 192, 256, 512, 1024]

function renderPng(size) {
  execFileSync("qlmanage", ["-t", "-s", String(size), "-o", workDir, sourceSvg], {
    stdio: "ignore",
  })

  return path.join(workDir, "tsv-boxgym-brand-mark.svg.png")
}

function renderAllPngs() {
  const outputs = new Map()

  for (const size of pngSizes) {
    const quickLookOutput = renderPng(size)
    const target = path.join(workDir, `logo-${size}.png`)
    copyFileSync(quickLookOutput, target)
    outputs.set(size, target)
  }

  return outputs
}

function buildIco(pngPaths) {
  const sizes = [16, 32, 48, 64, 256]
  const images = sizes.map((size) => readFileSync(pngPaths.get(size)))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(images.length * 16)
  let offset = header.length + directory.length

  images.forEach((image, index) => {
    const size = sizes[index]
    const entryOffset = index * 16

    directory.writeUInt8(size === 256 ? 0 : size, entryOffset)
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1)
    directory.writeUInt8(0, entryOffset + 2)
    directory.writeUInt8(0, entryOffset + 3)
    directory.writeUInt16LE(1, entryOffset + 4)
    directory.writeUInt16LE(32, entryOffset + 6)
    directory.writeUInt32LE(image.length, entryOffset + 8)
    directory.writeUInt32LE(offset, entryOffset + 12)

    offset += image.length
  })

  return Buffer.concat([header, directory, ...images])
}

function writeCopies(sourceFile, targets) {
  for (const target of targets) {
    copyFileSync(sourceFile, path.join(publicDir, target))
  }
}

try {
  const pngPaths = renderAllPngs()

  writeCopies(sourceSvg, ["boxgym-wordmark-tab.svg", "tsv-boxgym-tab.svg"])
  writeCopies(pngPaths.get(1024), ["BoxGym Kompakt.png"])
  writeCopies(pngPaths.get(512), ["tsv-boxgym-stack-icon.png", "tsv-boxgym-share-v3.png", "boxgym-icon.png", "boxgym-wordmark-icon.png", "tab_icon_square.png"])
  writeCopies(pngPaths.get(192), ["tsv-boxgym-stack-icon-192.png"])
  writeCopies(pngPaths.get(180), [
    "tsv-boxgym-stack-apple.png",
    "apple-touch-icon.png",
    "apple-touch-icon-precomposed.png",
    "boxgym-apple-icon.png",
    "boxgym-wordmark-apple.png",
    "boxgym-wordmark-apple-v2.png",
  ])

  const favicon = buildIco(pngPaths)
  for (const fileName of ["favicon.ico", "favicon-tsv-boxgym-stack.ico", "boxgym-favicon.ico", "favicon-boxgym-wordmark-v2.ico"]) {
    writeFileSync(path.join(publicDir, fileName), favicon)
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
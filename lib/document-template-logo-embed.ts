import { type PDFDocument, type PDFImage } from 'pdf-lib'

type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'unknown'

function detectImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png'
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'gif'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }

  return 'unknown'
}

async function convertToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const sharp = (await import('sharp')).default
    const converted = await sharp(Buffer.from(bytes)).png().toBuffer()
    return new Uint8Array(converted)
  } catch {
    return null
  }
}

async function tryEmbedPng(pdf: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    return await pdf.embedPng(bytes)
  } catch {
    return null
  }
}

async function tryEmbedJpeg(pdf: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    return await pdf.embedJpg(bytes)
  } catch {
    return null
  }
}

export async function embedLogoInPdf(
  pdf: PDFDocument,
  bytes: Uint8Array
): Promise<PDFImage | null> {
  if (!bytes.length) return null

  const format = detectImageFormat(bytes)

  if (format === 'png') {
    return tryEmbedPng(pdf, bytes)
  }

  if (format === 'jpeg') {
    return tryEmbedJpeg(pdf, bytes)
  }

  if (format === 'gif' || format === 'webp') {
    const pngBytes = await convertToPng(bytes)
    if (pngBytes) {
      return tryEmbedPng(pdf, pngBytes)
    }
    return null
  }

  const png = await tryEmbedPng(pdf, bytes)
  if (png) return png

  const jpeg = await tryEmbedJpeg(pdf, bytes)
  if (jpeg) return jpeg

  const converted = await convertToPng(bytes)
  if (converted) {
    return tryEmbedPng(pdf, converted)
  }

  return null
}

export async function loadLogoBytesFromUrl(logoUrl: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(logoUrl)
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}
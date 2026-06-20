import Tesseract from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

async function pdfToImages(file: File, page?: number): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: Blob[] = []
  let pageNumber = page ?? pdf.numPages;
  for (let pageNum = 1; pageNum <= pageNumber; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    // Render into the canvas element
    await page.render({ canvas, viewport }).promise
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
    images.push(blob)
  }

  return images
}

async function ocrFile(file: File): Promise<string> {
  const images = await pdfToImages(file, 1)
  let text = ''
  
  for (const image of images) {
    const { data } = await Tesseract.recognize(image, 'eng')
    text += data.text + '\n'
  }
  return text.trim()
}

export async function ocrFiles(
  files: File[],
  onProgress?: (current: number, total: number) => void,
): Promise<string> {
  let text = ''
  for (const [i, file] of files.entries()) {
    onProgress?.(i + 1, files.length)
    const fileText = await ocrFile(file)
    // console.log('Invoice ' + (i + 1) + '\n' + fileText)
    text += `\n\nInvoice ${i + 1}\n-----------------------------\n${fileText}`
  }
  return text
}

export async function ocrFilesIndividual(
  files: File[],
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const results: string[] = []
  for (const [i, file] of files.entries()) {
    onProgress?.(i + 1, files.length)
    const fileText = await ocrFile(file)
    const labeled = 'Invoice ' + (i + 1) + '\n' + fileText
    results.push(labeled)
    // console.log(labeled)
  }
  return results
}

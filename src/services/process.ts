// const LAMBDA_URL = 'http://localhost:8080/2015-03-31/functions/function/invocations'

import init, { decode_base64 } from "../../pkg/download_excel.js";
import * as XLSX from 'xlsx';

// const LAMBDA_URL = '/lambda/2015-03-31/functions/function/invocations'
const LAMBDA_URL = 'https://unk0evcl6k.execute-api.us-east-1.amazonaws.com/prod/'

let wasmReady = false;

async function loadWasm() {
    if (!wasmReady) {
        await init();
        wasmReady = true;
    }
    }

export interface ProcessPayload {
  name: string
  columns: string[]
  image_urls?: string[]
  text?: string
  jsons?: string[]
  as_json?: boolean
  as_excel?: boolean
}

interface LambdaResponse {
  statusCode: number
  body: {
    message: string
    excel_file?: string
    json_content?: string
  }
}

async function downloadExcel(base64: string, filename: string): Promise<string> {
  await loadWasm()
  const bytes = decode_base64(base64)
  const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return url
}


export async function processInfo(payload: ProcessPayload): Promise<{ message: string; filename: string, url:string }> {
  const result = await fetch(LAMBDA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!result.ok) {
    const text = await result.text()
    throw new Error(`Process failed (${result.status}): ${text}`)
  }

  const response: LambdaResponse = await result.json()
  const body = typeof response.body === 'string' 
  ? JSON.parse(response.body) 
  : response.body
  const { message, excel_file } = body

  if (!excel_file) {
    throw new Error('No excel file in response')
  }


  const filename = `extracted-${Date.now()}.xlsx`
    // console.log('getting here');
    const excelBase64 = Array.isArray(excel_file) ? excel_file[0] : excel_file
  const url = await downloadExcel(excelBase64, filename)

//   console.log("done!");
  return { message, filename, url }
}

export async function processBatch(payload: {
  name: string
  columns: string[]
  image_urls: string[]
}): Promise<{ message: string; filename: string; url: string }> {
  const BATCH_SIZE = 20
  const { name, columns, image_urls } = payload
  const batches: string[][] = []
  for (let i = 0; i < image_urls.length; i += BATCH_SIZE) {
    batches.push(image_urls.slice(i, i + BATCH_SIZE))
  }

  const allRows: Record<string, unknown>[] = []
  
  for (const batch of batches) {
    const res = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, columns, image_urls: batch, as_json: true }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Batch process failed (${res.status}): ${text}`)
    }
    const response: LambdaResponse = await res.json()
    console.log("the body response", response);
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
    console.log("the body", body);
    if (body.json_content) {
      const parsed = typeof body.json_content === 'string'
        ? JSON.parse(body.json_content)
        : body.json_content
      allRows.push(...parsed)
    } else {
      throw new Error('No JSON content in batch response')
    }
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(allRows, { header: columns })
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const filename = `extracted-${Date.now()}.xlsx`
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { message: 'Extraction complete', filename, url }
}





export async function processText(payload: {
  columns: string[]
  text: string
}): Promise<{ message: string; filename: string; url: string }> {
  const result = await fetch(LAMBDA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columns: payload.columns, text: payload.text }),
  })

  if (!result.ok) {
    const text = await result.text()
    throw new Error(`Process failed (${result.status}): ${text}`)
  }

  const response: LambdaResponse = await result.json()
  const body = typeof response.body === 'string'
    ? JSON.parse(response.body)
    : response.body
  const { message, excel_file } = body

  if (!excel_file) {
    throw new Error('No excel file in response')
  }

  const filename = `extracted-${Date.now()}.xlsx`
  const excelBase64 = Array.isArray(excel_file) ? excel_file[0] : excel_file
  const url = await downloadExcel(excelBase64, filename)
  return { message, filename, url }
}

export async function processTextBatch(payload: {
  columns: string[]
  texts: string[]
}): Promise<{ message: string; filename: string; url: string }> {
  console.log("the batches check");
  const BATCH_SIZE = 20
  const { columns, texts } = payload
  const batches: string[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE))
  }

  console.log("the batches check2");

  const allRows: Record<string, unknown>[] = []
  for (const batch of batches) {
    const res = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns, text: batch.join('\n\n---\n\n'), as_json: true }),
    })
    
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Batch process failed (${res.status}): ${text}`)
    
    }
    console.log("it okay");
    const json = await res.json();
    let response: LambdaResponse;
    if(json.body != null){
      response =  json as LambdaResponse;
    }else {
        response = {
            statusCode: json['statusCode'],
            body: json as LambdaResponse['body']
        }
    }
    const body = response.body;
    console.log("the batches check2", response);
    console.log("the batches check2 body", body);
    
 
    if (body.json_content) {
      const parsed = typeof body.json_content === 'string'
        ? JSON.parse(body.json_content)
        : body.json_content
      allRows.push(...parsed)
    } else {
      throw new Error('No JSON content in batch response')
    }
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(allRows, { header: columns })
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const filename = `extracted-${Date.now()}.xlsx`
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { message: 'Extraction complete', filename, url }
}

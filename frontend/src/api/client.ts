async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(text || `HTTP ${res.status}`)
  }
}

export type HealthResponse = {
  status: string
  model_type: string
  model_loaded: boolean
  max_upload_size_mb: number
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/health")
  if (!res.ok) throw new Error("Health check failed")
  return parseJson<HealthResponse>(res)
}

export type UploadSuccess = {
  success: true
  file_id: string
  filename: string
  image_url: string
  image_base64: string
  file_size: number
  timestamp: string
  model_type: string
  model_loaded: boolean
  message: string
}

type UploadError = { success?: false; error: string }

export async function uploadFile(file: File): Promise<UploadSuccess> {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/upload", { method: "POST", body: fd })
  const data = await parseJson<UploadSuccess | UploadError>(res)
  if (!res.ok || !data || typeof data !== "object" || !("success" in data) || !data.success) {
    const msg =
      data && typeof data === "object" && "error" in data && data.error
        ? data.error
        : `Upload failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

export type Prediction = {
  error?: string
  class: string
  confidence: number
  probabilities: { Benign: number; Malicious: number }
  simulation?: boolean
  model_available?: boolean
}

export type DetectSuccess = {
  success: true
  file_id: string
  filename: string
  prediction: Prediction
  detection_time: string
  model_type: string
  model_loaded: boolean
}

type DetectErrorBody = { success?: false; error?: string; model_loaded?: boolean }

export async function detectMalware(fileId: string): Promise<DetectSuccess> {
  const res = await fetch("/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  })
  const data = await parseJson<DetectSuccess | DetectErrorBody>(res)
  if (!res.ok || !data || typeof data !== "object" || !("success" in data) || !data.success) {
    const msg =
      data && typeof data === "object" && "error" in data && data.error
        ? data.error
        : `Detection failed (${res.status})`
    throw new Error(msg)
  }
  return data as DetectSuccess
}

import type { ReactNode } from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Bell,
  History,
  Loader2,
  Moon,
  ScanSearch,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  UserCircle,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import type { DetectSuccess, HealthResponse, Prediction, UploadSuccess } from "@/api/client"
import { detectMalware, getHealth, uploadFile } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const MAX_BYTES = 50 * 1024 * 1024
const MALWARE_ALERT_THRESHOLD = 70

type ActivityItem = {
  id: string
  name: string
  hash: string
  time: string
  status: "clean" | "threat"
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

function NavLink({
  active,
  icon,
  children,
  onClick,
}: {
  active?: boolean
  icon: string
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 px-6 py-4 text-left font-display text-sm font-bold tracking-wide uppercase transition-all duration-300",
        active
          ? "border-r-4 border-cyan-500 dark:border-cyan-400 bg-cyan-500/10 dark:bg-cyan-400/5 text-cyan-700 dark:text-cyan-400"
          : "text-zinc-600 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-300"
      )}
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      {children}
    </button>
  )
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const benignBarRef = useRef<HTMLDivElement>(null)
  const maliciousBarRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { theme, setTheme } = useTheme()

  const [activeNav, setActiveNav] = useState<"overview" | "scans">("overview")
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [upload, setUpload] = useState<UploadSuccess | null>(null)
  const [detectResult, setDetectResult] = useState<DetectSuccess | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [malwareDialogOpen, setMalwareDialogOpen] = useState(false)
  const [sessionScans, setSessionScans] = useState(0)
  const [activity, setActivity] = useState<ActivityItem[]>([])

  const refreshHealth = useCallback(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    refreshHealth()
    const id = setInterval(refreshHealth, 30_000)
    return () => clearInterval(id)
  }, [refreshHealth])

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from("[data-gsap-in]", { opacity: 0, y: 18, duration: 0.5, stagger: 0.05, ease: "power2.out" })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  useLayoutEffect(() => {
    if (!prediction || !benignBarRef.current || !maliciousBarRef.current) return
    const b = prediction.probabilities.Benign
    const m = prediction.probabilities.Malicious
    gsap.fromTo(
      benignBarRef.current,
      { scaleX: 0 },
      { scaleX: b / 100, duration: 0.85, ease: "power2.out", transformOrigin: "left center" }
    )
    gsap.fromTo(
      maliciousBarRef.current,
      { scaleX: 0 },
      { scaleX: m / 100, duration: 0.85, ease: "power2.out", transformOrigin: "left center" }
    )
  }, [prediction])

  useEffect(() => {
    if (!dropRef.current) return
    gsap.to(dropRef.current, {
      boxShadow: dragOver
        ? "0 0 0 2px rgba(34,211,238,0.45), 0 0 28px rgba(0,240,255,0.12)"
        : "0 0 0 1px rgba(128,128,128,0.08)",
      duration: 0.3,
      ease: "power2.out",
    })
  }, [dragOver])

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error(`File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.`)
      return
    }
    setUploading(true)
    setDetectResult(null)
    setPrediction(null)
    setUpload(null)
    try {
      const data = await uploadFile(file)
      setUpload(data)
      setSessionScans((n) => n + 1)
      toast.success("Binary map ready. Run Scan Now or detection from Scans.")
      gsap.from("[data-gsap-results]", { opacity: 0, y: 14, duration: 0.4, stagger: 0.04, ease: "power2.out" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }, [])

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return
      void processFile(files[0])
    },
    [processFile]
  )

  const runDetect = useCallback(async () => {
    if (!upload?.file_id) {
      toast.error("Import a file first (sidebar or drop zone).")
      return
    }
    setDetecting(true)
    setPrediction(null)
    try {
      const data = await detectMalware(upload.file_id)
      setDetectResult(data)
      setPrediction(data.prediction)
      const p = data.prediction
      const isMalicious = p.class === "Malicious"
      const shortHash = upload.file_id.slice(0, 4) + "…" + upload.file_id.slice(-4)
      const row: ActivityItem = {
        id: `${Date.now()}`,
        name: upload.filename,
        hash: shortHash,
        time: new Date().toLocaleTimeString(),
        status: isMalicious ? "threat" : "clean",
      }
      setActivity((prev) => [row, ...prev].slice(0, 8))
      if (isMalicious && p.confidence > MALWARE_ALERT_THRESHOLD) setMalwareDialogOpen(true)
      toast.success(
        isMalicious ? `Malicious (${p.confidence}%)` : `Benign (${p.confidence}%)`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detection failed")
    } finally {
      setDetecting(false)
    }
  }, [upload])

  const clearAll = useCallback(() => {
    setUpload(null)
    setDetectResult(null)
    setPrediction(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    toast.message("Session cleared")
  }, [])

  const downloadReport = useCallback(() => {
    if (!upload || !prediction) return
    const report = {
      filename: upload.filename,
      file_size: upload.file_size,
      upload_time: upload.timestamp,
      analysis_time: detectResult?.detection_time ?? new Date().toISOString(),
      prediction,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `malware_report_${upload.filename}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [upload, prediction, detectResult])

  const scanNow = useCallback(() => {
    if (upload?.file_id && !detecting) void runDetect()
    else fileInputRef.current?.click()
  }, [upload, detecting, runDetect])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault()
        fileInputRef.current?.click()
      }
      if (e.key === "Escape") clearAll()
      if (e.key === " " && upload?.file_id && !detecting) {
        e.preventDefault()
        void runDetect()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [clearAll, runDetect, upload, detecting])

  const chartData =
    prediction && !prediction.error
      ? [
        { name: "Benign", pct: prediction.probabilities.Benign },
        { name: "Malicious", pct: prediction.probabilities.Malicious },
      ]
      : []

  const modelReady = health?.model_loaded === true
  const threatLabel =
    prediction == null ? "NULL" : prediction.class === "Malicious" ? "ELEVATED" : "NULL"
  const threatColor =
    prediction?.class === "Malicious" ? "text-red-500" : "text-green-500"

  const loadBars = useMemo(
    () => [30, 45, 35, 60, 55, 40, 70, 45, 30, 50, 65, 40, 55, 45, 35],
    []
  )

  const scrollToScans = () => {
    setActiveNav("scans")
    document.getElementById("scan-sector")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const isDark = theme === "dark"

  return (
    <div ref={rootRef} className="min-h-svh overflow-x-hidden text-slate-900 dark:text-[#e5e2e1] antialiased">
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {/* SideNavBar */}
      <aside
        data-gsap-in
        className="fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#050505] py-8"
      >
        <div className="mb-12 px-8">
          <h1 className="font-display text-2xl font-black tracking-widest text-cyan-600 dark:text-cyan-500">MalSentry</h1>
          <p className="font-mono-v mt-3 max-w-[13.5rem] text-xs leading-relaxed tracking-wide text-zinc-500">
            SimCLR SSL on a ResNet-50 backbone (NT-Xent), then a fused layer3 / layer4 encoder with an SE block and
            binary head—trained on 224×224 byte-to-image maps for benign vs malicious.
          </p>
        </div>
        <nav className="flex flex-1 flex-col space-y-1">
          <NavLink active={activeNav === "overview"} icon="dashboard" onClick={() => setActiveNav("overview")}>
            Overview
          </NavLink>
          <NavLink active={activeNav === "scans"} icon="radar" onClick={scrollToScans}>
            Scans
          </NavLink>
          <NavLink icon="security" onClick={() => toast.message("Quarantine", { description: "UI shell — use scan results." })}>
            Quarantine
          </NavLink>
          <NavLink icon="list_alt" onClick={() => toast.message("Logs", { description: "See Recent Activity panel." })}>
            Logs
          </NavLink>
          <NavLink icon="settings" onClick={() => toast.message("Settings", { description: "Flask API only in this build." })}>
            Settings
          </NavLink>
        </nav>
        <div className="mt-auto px-6">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-display w-full rounded-lg border border-cyan-600/30 dark:border-cyan-400/30 bg-cyan-600/10 dark:bg-cyan-400/10 py-3 text-sm font-bold tracking-widest text-cyan-700 dark:text-cyan-400 uppercase transition-all hover:bg-cyan-600 dark:hover:bg-cyan-400 hover:text-white dark:hover:text-black active:scale-95"
          >
            Import Node
          </button>
          <div className="mt-8 flex items-center gap-3 rounded-xl bg-slate-100 dark:bg-white/5 p-3">
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-cyan-500/30 dark:border-cyan-400/20 bg-cyan-100 dark:bg-cyan-950">
              <UserCircle className="size-6 text-cyan-600 dark:text-cyan-400/80" />
            </div>
            <div>
              <p className="text-sm font-bold">Operator</p>
              <p className="text-xs font-medium text-zinc-500">Node Controller</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="ml-64 flex min-h-svh flex-col">
        {/* TopAppBar */}
        <header
          data-gsap-in
          className="fixed top-0 right-0 left-64 z-40 flex h-16 items-center justify-between border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-black/80 px-8 shadow-[0_0_20px_rgba(0,240,255,0.05)] backdrop-blur-md"
        >
          <div className="flex items-center gap-4">
            <div className="group relative">
              <span className="material-symbols-outlined pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-zinc-500 text-[20px]">
                search
              </span>
              <input
                readOnly
                className="font-body w-64 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 py-1.5 pr-4 pl-10 text-sm transition-all placeholder:text-zinc-500 dark:placeholder:text-zinc-600 focus:border-cyan-500/50 dark:focus:border-cyan-400/50 focus:ring-0 focus:outline-none"
                placeholder="Global node search…"
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 border-r border-slate-200 dark:border-white/10 pr-6">
              <button type="button" className="text-zinc-500 transition-colors hover:text-cyan-600 dark:hover:text-cyan-400" aria-label="Notifications">
                <Bell className="size-5" />
              </button>
              <button type="button" className="text-zinc-500 transition-colors hover:text-cyan-600 dark:hover:text-cyan-400" aria-label="History">
                <History className="size-5" />
              </button>
              <button type="button" className="text-zinc-500 transition-colors hover:text-cyan-600 dark:hover:text-cyan-400" aria-label="Account">
                <UserCircle className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="text-zinc-500 transition-colors hover:text-cyan-600 dark:hover:text-cyan-400"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
            </div>
            <Button
              type="button"
              onClick={scanNow}
              disabled={detecting}
              className="rounded bg-cyan-500 dark:bg-cyan-400 px-6 py-1.5 font-display text-sm font-bold tracking-tight text-white dark:text-black shadow-none hover:bg-cyan-600 dark:hover:bg-cyan-300 active:scale-95"
            >
              {detecting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Scanning
                </span>
              ) : (
                "Scan Now"
              )}
            </Button>
          </div>
        </header>

        <main className="mt-16 flex-1 overflow-y-auto p-10">
          <div className="grid grid-cols-12 gap-6">
            {/* Left column */}
            <div className="col-span-12 flex flex-col gap-6 lg:col-span-8">
              {/* Status gauge */}
              <section
                data-gsap-in
                className="glass-card relative flex min-h-[380px] flex-col items-center justify-center overflow-hidden rounded-2xl p-10"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,240,255,0.2),transparent_70%)] opacity-10" />
                <div className="relative flex h-72 w-72 items-center justify-center rounded-full border-[12px] border-slate-200 dark:border-white/5">
                  <div className="status-gauge absolute inset-0 rounded-full opacity-30 blur-sm" />
                  <div className="absolute inset-0 animate-pulse rounded-full border-4 border-cyan-400/20" />
                  <div className="z-10 text-center">
                    <span className="material-symbols-outlined mb-2 text-6xl text-cyan-600 dark:text-cyan-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                      verified_user
                    </span>
                    <h2 className="font-display text-4xl leading-tight font-semibold tracking-tight text-cyan-600 dark:text-cyan-400 md:text-5xl">
                      {prediction?.class === "Malicious" ? "Alert" : "Detector"}
                    </h2>
                    <p className="font-mono-v mt-2 max-w-[20rem] text-center text-sm leading-relaxed tracking-[0.08em] text-zinc-600 dark:text-zinc-400 uppercase">
                      Image based malware detection
                    </p>
                  </div>
                </div>
                <div className="mt-8 flex gap-12">
                  <div className="text-center">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Threat Level</p>
                    <p className={cn("font-display text-lg font-bold", threatColor)}>{threatLabel}</p>
                  </div>
                  <div className="border-x border-slate-200 dark:border-white/10 px-12 text-center">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">AI Heuristics</p>
                    <p className="font-display text-lg font-bold text-cyan-600 dark:text-cyan-400">{modelReady ? "ACTIVE" : "SIM"}</p>
                  </div>
                  <div className="text-center">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Engine</p>
                    <p className="font-display text-lg font-bold text-zinc-600 dark:text-zinc-300">{health?.model_type ?? "—"}</p>
                  </div>
                </div>
              </section>

              {/* Metric bento */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div data-gsap-in className="glass-card glow-cyan rounded-xl p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <span className="material-symbols-outlined text-zinc-500">bug_report</span>
                    <span className="rounded bg-slate-100 dark:bg-white/5 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">REAL-TIME</span>
                  </div>
                  <p className="mb-1 text-sm font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Active Threats</p>
                  <h3 className="font-display text-3xl font-medium text-slate-900 dark:text-white">
                    {prediction?.class === "Malicious" ? "1" : "0"}
                  </h3>
                </div>
                <div data-gsap-in className="glass-card rounded-xl p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <span className="material-symbols-outlined text-zinc-500">folder_zip</span>
                    <span className="rounded bg-cyan-500/10 dark:bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-700 dark:text-cyan-400">SESSION</span>
                  </div>
                  <p className="mb-1 text-sm font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Files Scanned</p>
                  <h3 className="font-display text-3xl font-medium text-slate-900 dark:text-white">{sessionScans}</h3>
                </div>
                <div data-gsap-in className="glass-card rounded-xl p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <span className="material-symbols-outlined text-zinc-500">bolt</span>
                    <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-500">API</span>
                  </div>
                  <p className="mb-1 text-sm font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Max Upload</p>
                  <h3 className="font-display text-3xl font-medium text-slate-900 dark:text-white">{health?.max_upload_size_mb ?? 50}M</h3>
                </div>
              </div>

              {/* System load chart */}
              <section data-gsap-in className="glass-card rounded-2xl p-8">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-xl font-medium text-slate-900 dark:text-white">Classifier Output</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Benign vs malicious probability mass</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-cyan-500 dark:bg-cyan-400" />
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Signal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-zinc-400 dark:bg-zinc-600" />
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Baseline</span>
                    </div>
                  </div>
                </div>
                {chartData.length > 0 ? (
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} />
                        <XAxis dataKey="name" tick={{ fill: isDark ? "#71717a" : "#64748b", fontSize: 11 }} axisLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: isDark ? "#71717a" : "#64748b", fontSize: 11 }} axisLine={false} />
                        <RechartsTooltip
                          contentStyle={{
                            background: isDark ? "#131313" : "#ffffff",
                            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: isDark ? "#e5e2e1" : "#0f172a",
                          }}
                        />
                        <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={entry.name === "Benign" ? "rgba(34,211,238,0.35)" : "rgba(248,113,113,0.55)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-48 items-end gap-1 px-2">
                    {loadBars.map((h, i) => (
                      <div
                        key={i}
                        className="hover:bg-cyan-500/35 dark:hover:bg-cyan-400/35 w-full rounded-t-sm bg-cyan-500/20 dark:bg-cyan-400/20 transition-colors"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Scan sector: upload + analysis */}
              <div id="scan-sector" className="scroll-mt-24 space-y-6">
                <div ref={dropRef} data-gsap-results>
                  <div
                    className={cn(
                      "glass-card rounded-2xl p-8 transition-shadow",
                      dragOver && "ring-1 ring-cyan-500/30 dark:ring-cyan-400/30"
                    )}
                  >
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="font-display text-xl font-medium text-slate-900 dark:text-white">Node Ingest</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Drop payload · binary visualization · POST /detect</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-slate-300 dark:border-white/15 bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                          onClick={clearAll}
                        >
                          <Trash2 className="size-4" />
                          Clear
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!upload?.file_id || detecting}
                          onClick={() => void runDetect()}
                          className="bg-cyan-500/15 dark:bg-cyan-400/15 font-display text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500 dark:hover:bg-cyan-400 hover:text-white dark:hover:text-black"
                        >
                          {detecting ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
                          Analyze
                        </Button>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={uploading}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragOver(true)
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                        onFiles(e.dataTransfer.files)
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-white/[0.04] px-6 py-12 transition-colors",
                        "hover:border-cyan-500/40 dark:hover:border-cyan-400/40 hover:bg-cyan-50 dark:hover:bg-cyan-400/5",
                        uploading && "pointer-events-none opacity-60"
                      )}
                    >
                      {uploading ? (
                        <Loader2 className="size-10 animate-spin text-cyan-600 dark:text-cyan-400" />
                      ) : (
                        <span className="material-symbols-outlined text-4xl text-zinc-500 dark:text-zinc-400">upload_file</span>
                      )}
                      <p className="font-display text-sm font-bold tracking-wide text-zinc-600 dark:text-zinc-300 uppercase">
                        Drop file or click to ingest
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-500">⌘O · Space when ready · Esc clear</p>
                    </button>

                    {uploading && (
                      <div className="mt-6 space-y-3">
                        <Skeleton className="h-36 w-full rounded-lg bg-slate-200 dark:bg-white/5" />
                        <Skeleton className="h-3 w-2/3 bg-slate-200 dark:bg-white/5" />
                      </div>
                    )}

                    {upload && !uploading && (
                      <div className="mt-8 space-y-6 border-t border-slate-200 dark:border-white/10 pt-8">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="font-mono-v text-xs tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Object</p>
                            <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">{upload.filename}</p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                              {formatBytes(upload.file_size)} · {upload.model_type}
                            </p>
                          </div>
                          <Shield className="size-8 text-cyan-500/60 dark:text-cyan-400/60" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Binary Visualization</p>
                          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/40">
                            <img
                              src={upload.image_base64}
                              alt="Binary byte-to-image map"
                              className="mx-auto w-full object-contain"
                              style={{ imageRendering: "pixelated", maxHeight: "224px" }}
                            />
                          </div>
                          <p className="text-xs text-zinc-500 text-center">224×224 byte-to-image map fed to the classifier</p>
                        </div>
                        <div className="space-y-3">
                          <p className="text-sm font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 uppercase">Probabilities</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                              <span>Benign</span>
                              <span>{prediction?.probabilities.Benign ?? 0}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                              <div
                                ref={benignBarRef}
                                className="h-full w-full origin-left rounded-full bg-cyan-500/80 dark:bg-cyan-400/80"
                                style={{ transform: "scaleX(0)" }}
                              />
                            </div>
                            <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                              <span>Malicious</span>
                              <span>{prediction?.probabilities.Malicious ?? 0}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                              <div
                                ref={maliciousBarRef}
                                className="h-full w-full origin-left rounded-full bg-red-500/80"
                                style={{ transform: "scaleX(0)" }}
                              />
                            </div>
                          </div>
                        </div>
                        {prediction && (
                          <div className="flex items-start gap-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] p-4">
                            {prediction.class === "Malicious" ? (
                              <ShieldAlert className="mt-0.5 size-8 shrink-0 text-red-500 dark:text-red-400" />
                            ) : (
                              <ShieldCheck className="mt-0.5 size-8 shrink-0 text-cyan-600 dark:text-cyan-400" />
                            )}
                            <div>
                              <p className="font-display text-lg font-bold text-slate-900 dark:text-white">{prediction.class}</p>
                              <p className="text-sm text-zinc-500">
                                Confidence {prediction.confidence}%
                                {prediction.simulation ? " · SIM" : ""}
                              </p>
                              {prediction.error && (
                                <p className="mt-1 text-sm text-amber-500 dark:text-amber-400">{prediction.error}</p>
                              )}
                            </div>
                          </div>
                        )}
                        {detecting && (
                          <div className="mt-2">
                            <Progress value={66}>
                              <div className="flex w-full items-center justify-between gap-2">
                                <ProgressLabel>Analyzing</ProgressLabel>
                                <ProgressValue />
                              </div>
                              <ProgressTrack>
                                <ProgressIndicator className="bg-cyan-500 dark:bg-cyan-400" />
                              </ProgressTrack>
                            </Progress>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column — activity */}
            <div className="col-span-12 flex flex-col gap-6 lg:col-span-4">
              <section
                data-gsap-in
                className="glass-card flex h-full min-h-[520px] flex-col rounded-2xl p-6"
              >
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="font-display text-xl font-medium text-slate-900 dark:text-white">Recent Activity</h3>
                  <button
                    type="button"
                    className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                    onClick={() => setActivity([])}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
                  {activity.length === 0 ? (
                    <p className="text-sm text-zinc-500">No scan events yet. Run analysis to populate the feed.</p>
                  ) : (
                    activity.map((row) => (
                      <div
                        key={row.id}
                        className={cn(
                          "flex items-center gap-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 p-4",
                          row.status === "threat" && "border-l-2 border-l-red-500"
                        )}
                      >
                        <div
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-lg",
                            row.status === "threat" ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600 dark:text-green-500"
                          )}
                        >
                          <span className="material-symbols-outlined text-[22px]">
                            {row.status === "threat" ? "dangerous" : "check_circle"}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.name}</p>
                          <p className="font-mono-v text-xs text-zinc-500">HASH: {row.hash}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-zinc-500">{row.time}</p>
                          <p
                            className={cn(
                              "text-xs font-bold tracking-wide uppercase",
                              row.status === "threat" ? "text-red-500" : "text-green-600 dark:text-green-500"
                            )}
                          >
                            {row.status === "threat" ? "Threat" : "Clean"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-6">
                  <div className="rounded-xl border border-cyan-500/20 dark:border-cyan-400/10 bg-cyan-50 dark:bg-cyan-400/5 p-4">
                    <h4 className="mb-2 text-sm font-bold tracking-wide text-cyan-700 dark:text-cyan-400 uppercase">Security Tip</h4>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Verify high-risk signals with a second engine before quarantining production nodes.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <footer className="mt-12 border-t border-slate-200 dark:border-white/10 pt-6 text-center font-mono-v text-xs tracking-wide text-zinc-500 uppercase">
            MalSentry · Flask backend · file_id pipeline
          </footer>
        </main>
      </div>

      <Dialog open={malwareDialogOpen} onOpenChange={setMalwareDialogOpen}>
        <DialogContent className="border-slate-200 dark:border-white/10 bg-white dark:bg-[#131313] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-red-500 dark:text-red-400">
              <ShieldAlert className="size-5" />
              High-risk signal
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Model flagged this sample above {MALWARE_ALERT_THRESHOLD}% confidence. Treat as untrusted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-slate-300 dark:border-white/15 bg-transparent"
              onClick={() => setMalwareDialogOpen(false)}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              className="bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black hover:bg-cyan-600 dark:hover:bg-cyan-300"
              onClick={downloadReport}
            >
              Export JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-center" />
    </div>
  )
}

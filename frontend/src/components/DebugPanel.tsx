import { useState, useEffect } from 'react'

interface DebugLogEntry {
  timestamp: string
  message: string
}

let logListeners: ((entry: DebugLogEntry) => void)[] = []

export function debugLog(message: string) {
  const entry = { timestamp: new Date().toLocaleTimeString(), message }
  logListeners.forEach((listener) => listener(entry))
}

export function DebugPanel() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([])

  useEffect(() => {
    const listener = (entry: DebugLogEntry) => {
      setLogs((prev) => [...prev.slice(-19), entry])
    }
    logListeners.push(listener)
    return () => {
      logListeners = logListeners.filter((l) => l !== listener)
    }
  }, [])

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-96 max-h-64 overflow-y-auto bg-black/90 border border-white/30 rounded-lg p-2 text-[10px] font-mono text-white/80 space-y-0.5">
      <div className="text-white/50 uppercase tracking-widest mb-1">Debug Log</div>
      {logs.length === 0 && <div className="text-white/30">No events yet</div>}
      {logs.map((log, i) => (
        <div key={i}>
          <span className="text-white/40">{log.timestamp}</span> {log.message}
        </div>
      ))}
    </div>
  )
}
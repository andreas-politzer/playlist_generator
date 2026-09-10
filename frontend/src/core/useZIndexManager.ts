import { useRef, useState, useCallback } from 'react'

export function useZIndexManager() {
  const nextZRef = useRef(1)
  const [zIndices, setZIndices] = useState<Record<string, number>>({})

  const bringToFront = useCallback((id: string) => {
    nextZRef.current += 1
    const nextZ = nextZRef.current
    setZIndices((prev) => ({ ...prev, [id]: nextZ }))
  }, [])

  const getZIndex = useCallback(
    (id: string) => zIndices[id] ?? 0,
    [zIndices],
  )

  return { bringToFront, getZIndex }
}
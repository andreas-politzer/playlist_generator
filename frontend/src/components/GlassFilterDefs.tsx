export function GlassFilterDefs() {
  return (
    <svg className="absolute w-0 h-0">
      <filter id="glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="3" result="blurredNoise" />
        <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="45" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
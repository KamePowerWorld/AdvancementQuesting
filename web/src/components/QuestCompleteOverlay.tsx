import { useEffect, useRef, useState } from 'react'
import type { QuestCompleteEvent } from '@/hooks/useQuestNotifications.js'

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  life: number
  maxLife: number
}

const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98FB98']

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function createParticles(count: number): Particle[] {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 3
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: cx + randomBetween(-60, 60),
    y: cy + randomBetween(-20, 20),
    vx: randomBetween(-4, 4),
    vy: randomBetween(-8, -2),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: randomBetween(4, 10),
    life: 1,
    maxLife: randomBetween(60, 120),
  }))
}

interface Props {
  event: QuestCompleteEvent | null
  onDone: () => void
}

export function QuestCompleteOverlay({ event, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!event) return
    setVisible(true)
    particlesRef.current = createParticles(80)

    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    let frame = 0
    function animate() {
      frame++
      const ctx = canvas!.getContext('2d')!
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)

      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15,
          life: p.life - 1 / p.maxLife,
        }))
        .filter((p) => p.life > 0)

      for (const p of particlesRef.current) {
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setVisible(false)
        onDone()
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [event, onDone])

  if (!event) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 flex flex-col items-center"
      style={{ top: '15%' }}
      data-testid="quest-complete-overlay"
    >
      {visible && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ top: 0, left: 0, position: 'fixed' }}
        />
      )}
      <div
        className="relative px-6 py-3 border-4 font-bold text-center"
        style={{
          fontFamily: '"Courier New", Courier, monospace',
          backgroundColor: '#1a1a0a',
          color: '#FFD700',
          borderColor: '#FFD700',
          boxShadow: '0 0 20px rgba(255,215,0,0.5)',
          animation: 'quest-complete-pop 0.4s ease-out',
        }}
      >
        <div className="text-xs mb-1" style={{ color: '#C6C6C6' }}>クエスト完了！</div>
        <div className="text-lg">{event.questTitle}</div>
        <div className="text-xs mt-1" style={{ color: '#98FB98' }}>{event.playerName} が達成しました</div>
      </div>
      <style>{`
        @keyframes quest-complete-pop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}

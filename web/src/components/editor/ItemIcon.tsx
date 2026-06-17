import type { FC, CSSProperties } from 'react'
import { useMcAtlas } from '@/hooks/useMcData.js'

interface ItemIconProps {
  type: string
  size?: number
}

const FALLBACK_COLORS: Record<string, string> = {
  book:     '#8B4513',
  diamond:  '#55FFFF',
  stone:    '#AAAAAA',
  grass:    '#55FF55',
  wood:     '#5c4033',
  apple:    '#FF5555',
  chest:    '#D2B48C',
  gold:     '#FFAA00',
  emerald:  '#55FF55',
  redstone: '#AA0000',
  obsidian: '#110b1a',
  sword:    '#8b5a2b',
}

function getFallbackColor(type: string): string {
  for (const [key, color] of Object.entries(FALLBACK_COLORS)) {
    if (type.includes(key)) return color
  }
  return '#888888'
}

export const ItemIcon: FC<ItemIconProps> = ({ type, size = 32 }) => {
  const { data: atlas } = useMcAtlas()

  // アトラス読み込み中: プレースホルダー
  if (!atlas) {
    return (
      <div
        style={{ width: size, height: size, flexShrink: 0 }}
        className="bg-gray-700 animate-pulse rounded-sm"
      />
    )
  }

  // item/ → block/ の順で座標を探す
  const itemEntry = atlas.coords['item/' + type]
  const blockEntry = atlas.coords['block/' + type]
  const entry = itemEntry ?? blockEntry
  const isItem = !!itemEntry

  if (entry) {
    const [ax, ay, aw] = entry
    let style: CSSProperties

    if (isItem) {
      // items atlas (misode): タイル幅 aw px、atlas 全体は itemsSize
      const scale = size / aw
      style = {
        width: size,
        height: size,
        flexShrink: 0,
        imageRendering: 'pixelated',
        backgroundImage: 'url(/mc/atlas/items.png)',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `-${ax * scale}px -${ay * scale}px`,
        backgroundSize: `${atlas.itemsSize.w * scale}px ${atlas.itemsSize.h * scale}px`,
      }
    } else {
      // blocks atlas (minecraft-render): タイルは blockTileSize x blockTileSize
      // レンダリング画像は64x64タイル内で中央寄りに小さく描かれるため2倍スケールで表示する
      // タイル中央が表示領域中央に来るよう: posX = -(ax + tileSize/2)*scale + size/2
      const tileSize = atlas.blockTileSize
      const scale = (size / tileSize) * 1.6
      const atlasW = atlas.blockAtlasW || tileSize * 32
      const cx = -(ax + tileSize / 2) * scale + size / 2
      const cy = -(ay + tileSize / 2) * scale + size / 2
      style = {
        width: size,
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
        backgroundImage: 'url(/mc/atlas/blocks.png)',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${cx}px ${cy}px`,
        backgroundSize: `${atlasW * scale}px auto`,
      }
    }

    return <div style={style} title={type} aria-label={type} />
  }

  // アトラスに存在しない: SVG カラーフォールバック
  const color = getFallbackColor(type)
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ flexShrink: 0 }} aria-label={type}>
      <rect x="2" y="2" width="28" height="28" fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth="2" rx="2" />
    </svg>
  )
}

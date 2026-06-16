import type { FC, ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'

interface ToolButtonProps {
  icon: ComponentType<LucideProps>
  active: boolean
  onClick: () => void
  tooltip: string
  className?: string
}

/**
 * 左サイドバーのツールボタン
 * active 時はMinecraft風の「押し込まれた」ベベルスタイルを適用する
 * ホバー時にフローティングツールチップを表示する
 */
export const ToolButton: FC<ToolButtonProps> = ({ icon: Icon, active, onClick, tooltip, className = '' }) => (
  <div className="relative group">
    <button
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      className={[
        'w-10 h-10 flex items-center justify-center border-2',
        className,
        active
          // 押し込まれた状態: 暗い上・左ボーダー、明るい下・右ボーダー
          ? 'bg-[#7B7B7B] border-t-[#3B3B3B] border-l-[#3B3B3B] border-b-[#C6C6C6] border-r-[#C6C6C6]'
          // 通常状態: 明るい上・左ボーダー、暗い下・右ボーダー
          : 'bg-[#C6C6C6] hover:bg-[#D6D6D6] border-t-white border-l-white border-b-[#555555] border-r-[#555555]',
      ].join(' ')}
    >
      <Icon size={20} color="#333" />
    </button>
    {/* ツールチップ: グループホバーで表示 */}
    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 border border-purple-500">
      {tooltip}
    </div>
  </div>
)

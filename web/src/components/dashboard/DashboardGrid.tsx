import ReactGridLayout, { type Layout, type LayoutItem } from 'react-grid-layout/legacy'
import type { DashboardConfig, DashboardWidget } from '@/types/dashboard.js'
import { WidgetWrapper } from './widgets/WidgetWrapper.js'
import { LeaderboardWidget } from './widgets/LeaderboardWidget.js'
import { TimeseriesWidget } from './widgets/TimeseriesWidget.js'
import { RewardsWidget } from './widgets/RewardsWidget.js'
import { QuestsWidget } from './widgets/QuestsWidget.js'
import { ActivityWidget } from './widgets/ActivityWidget.js'
import { AllRewardsWidget } from './widgets/AllRewardsWidget.js'
import type {
  LeaderboardConfig,
  TimeseriesConfig,
  RewardsConfig,
  QuestsConfig,
} from '@/types/dashboard.js'

interface Props {
  config: DashboardConfig
  canEdit: boolean
  width: number
  onLayoutChange: (updatedWidgets: DashboardWidget[]) => void
  onWidgetRemove: (id: string) => void
  onConfigOpen: (widget: DashboardWidget) => void
}

function renderWidgetContent(widget: DashboardWidget) {
  const { type, config } = widget
  switch (type) {
    case 'leaderboard': return <LeaderboardWidget config={config as unknown as LeaderboardConfig} />
    case 'timeseries':  return <TimeseriesWidget config={config as unknown as TimeseriesConfig} />
    case 'rewards':     return <RewardsWidget config={config as unknown as RewardsConfig} />
    case 'quests':      return <QuestsWidget config={config as unknown as QuestsConfig} />
    case 'activity':    return <ActivityWidget />
    case 'allrewards':  return <AllRewardsWidget />
  }
}

export function DashboardGrid({ config, canEdit, width, onLayoutChange, onWidgetRemove, onConfigOpen }: Props) {
  const layout: Layout = config.widgets.map((w): LayoutItem => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    minW: 2,
    minH: 3,
  }))

  function handleLayoutChange(newLayout: Layout) {
    const updatedWidgets = config.widgets.map((w) => {
      const l = newLayout.find((nl: LayoutItem) => nl.i === w.id)
      if (!l) return w
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }
    })
    onLayoutChange(updatedWidgets)
  }

  if (config.widgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        {canEdit ? 'ウィジェットを追加してください' : 'ダッシュボードが未設定です'}
      </div>
    )
  }

  return (
    <ReactGridLayout
      layout={layout}
      cols={12}
      rowHeight={60}
      width={width}
      isDraggable={canEdit}
      isResizable={canEdit}
      onLayoutChange={handleLayoutChange}
      draggableHandle=".drag-handle"
      resizeHandles={['se']}
    >
      {config.widgets.map((w) => (
        <div key={w.id} className="h-full">
          <WidgetWrapper
            widget={w}
            canEdit={canEdit}
            onConfigOpen={() => onConfigOpen(w)}
            onRemove={() => onWidgetRemove(w.id)}
          >
            {renderWidgetContent(w)}
          </WidgetWrapper>
        </div>
      ))}
    </ReactGridLayout>
  )
}

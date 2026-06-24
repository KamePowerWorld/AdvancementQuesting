import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard.js'
import { useAuth } from '@/contexts/AuthContext.js'
import type { DashboardConfig, DashboardWidget, WidgetType } from '@/types/dashboard.js'
import { DEFAULT_WIDGET_CONFIGS, DEFAULT_WIDGET_SIZES } from '@/types/dashboard.js'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid.js'
import { AddWidgetBar } from '@/components/dashboard/AddWidgetBar.js'
import { WidgetConfigModal, type WidgetConfigSavePayload } from '@/components/dashboard/WidgetConfigModal.js'

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

export function DashboardPage() {
  const { isEditor, viewMode } = useAuth()
  const canEdit = isEditor && viewMode === 'edit'
  const queryClient = useQueryClient()

  const { data: remoteConfig, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
    staleTime: Infinity,
  })

  const [localConfig, setLocalConfig] = useState<DashboardConfig | null>(null)
  const config = localConfig ?? remoteConfig ?? { widgets: [] }

  const mutation = useMutation({
    mutationFn: dashboardApi.put,
    onSuccess: (_, cfg) => {
      queryClient.setQueryData(['dashboard'], cfg)
    },
  })

  const debouncedSave = useRef(
    debounce((...args: unknown[]) => {
      mutation.mutate(args[0] as DashboardConfig)
    }, 800),
  ).current

  const updateConfig = useCallback((newConfig: DashboardConfig) => {
    setLocalConfig(newConfig)
    debouncedSave(newConfig)
  }, [debouncedSave])

  const [configModalWidget, setConfigModalWidget] = useState<DashboardWidget | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(1200)

  const refCallback = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    ;(containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    const ro = new ResizeObserver(([entry]) => {
      setGridWidth(entry.contentRect.width)
    })
    ro.observe(el)
    setGridWidth(el.clientWidth)
  }, [])

  function handleAddWidget(type: WidgetType) {
    const id = crypto.randomUUID()
    const size = DEFAULT_WIDGET_SIZES[type]
    const existingY = config.widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0)
    const newWidget: DashboardWidget = {
      id,
      type,
      config: { ...DEFAULT_WIDGET_CONFIGS[type] },
      layout: { x: 0, y: existingY, w: size.w, h: size.h },
    }
    updateConfig({ widgets: [...config.widgets, newWidget] })
  }

  function handleLayoutChange(updatedWidgets: DashboardWidget[]) {
    updateConfig({ widgets: updatedWidgets })
  }

  function handleWidgetConfigChange(id: string, { config: newConfig, customTitle, description }: WidgetConfigSavePayload) {
    const updatedWidgets = config.widgets.map((w) =>
      w.id === id ? { ...w, config: newConfig, customTitle, description } : w,
    )
    updateConfig({ widgets: updatedWidgets })
  }

  function handleWidgetRemove(id: string) {
    updateConfig({ widgets: config.widgets.filter((w) => w.id !== id) })
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        読み込み中...
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: '#3a3f3b' }}>
      {canEdit && <AddWidgetBar onAdd={handleAddWidget} />}
      {mutation.isPending && (
        <div className="shrink-0 text-[10px] text-gray-400 px-3 py-0.5 bg-[#2d2f3b]">保存中...</div>
      )}
      <div ref={refCallback} className="flex-1 overflow-auto">
        <DashboardGrid
          config={config}
          canEdit={canEdit}
          width={gridWidth}
          onLayoutChange={handleLayoutChange}

          onWidgetRemove={handleWidgetRemove}
          onConfigOpen={setConfigModalWidget}
        />
      </div>
      {configModalWidget && (
        <WidgetConfigModal
          widget={configModalWidget}
          onSave={(payload) => handleWidgetConfigChange(configModalWidget.id, payload)}
          onClose={() => setConfigModalWidget(null)}
        />
      )}
    </div>
  )
}

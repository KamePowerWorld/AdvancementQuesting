import { useQuery } from '@tanstack/react-query'
import { NamespacedId } from '@/util/NamespacedId.js'

export interface McItemEntry {
  id: NamespacedId
  name: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.json() as Promise<T>
}

/** ja_jp.json + en_us.json をロードして返す */
export function useMcLang() {
  return useQuery({
    queryKey: ['mc-lang'],
    queryFn: async () => {
      const [ja, en] = await Promise.all([
        fetchJson<Record<string, string>>('/mc/lang/ja_jp.json'),
        fetchJson<Record<string, string>>('/mc/lang/en_us.json'),
      ])
      return { ja, en }
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

/** アイテム名を解決する (ja優先、enフォールバック、なければfullId) */
export function getItemName(
  lang: { ja: Record<string, string>; en: Record<string, string> } | undefined,
  id: NamespacedId,
): string {
  if (!lang) return id.toString()
  const itemKey = id.langKey('item')
  const blockKey = id.langKey('block')
  return (
    lang.ja[itemKey] ??
    lang.ja[blockKey] ??
    lang.en[itemKey] ??
    lang.en[blockKey] ??
    id.toString()
  )
}

/** アトラスの座標マップ型: キー → [x, y, width, height] */
export type AtlasMap = Record<string, [number, number, number, number]>

export interface AtlasData {
  /** キー → [x, y, w, h] 座標マップ (item/* と block/* が混在) */
  coords: AtlasMap
  /** items atlas (misode) の実際の画像サイズ */
  itemsSize: { w: number; h: number }
  /** blocks atlas (minecraft-render) のタイルサイズ (通常 64) */
  blockTileSize: number
  /** blocks atlas の幅 (px) */
  blockAtlasW: number
}

/** items アトラス (misode) と blocks アトラス (minecraft-render) をマージして返す */
export function useMcAtlas() {
  return useQuery({
    queryKey: ['mc-atlas'],
    queryFn: async (): Promise<AtlasData> => {
      const [itemsRes, blocksRes, sizeRes] = await Promise.allSettled([
        fetchJson<AtlasMap>('/mc/atlas/items.json'),
        fetchJson<AtlasMap>('/mc/atlas/blocks.json'),
        fetchJson<{ w: number; h: number }>('/mc/atlas/items-size.json'),
      ])
      const coords: AtlasMap = {}
      if (itemsRes.status === 'fulfilled') Object.assign(coords, itemsRes.value)
      if (blocksRes.status === 'fulfilled') Object.assign(coords, blocksRes.value)

      const itemsSize = sizeRes.status === 'fulfilled'
        ? sizeRes.value
        : { w: 512, h: 512 }

      // blocks atlas のメタ情報 (_meta キー) からタイルサイズと atlas 幅を取得
      let blockTileSize = 64
      let blockAtlasW = 0
      if (blocksRes.status === 'fulfilled') {
        const meta = (blocksRes.value as Record<string, unknown>)['_meta'] as { atlasW: number; tileSize: number } | undefined
        if (meta) { blockTileSize = meta.tileSize; blockAtlasW = meta.atlasW }
      }

      return { coords, itemsSize, blockTileSize, blockAtlasW }
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

/** アドバンスメント名を lang ファイルから解決する */
export function getAdvancementName(
  lang: { ja: Record<string, string>; en: Record<string, string> } | undefined,
  id: NamespacedId,
): string {
  if (!lang) return id.toString()
  // "minecraft:story/mine_wood" → "advancements.story.mine_wood.title"
  const key = id.advancementLangKey()
  return lang.ja[key] ?? lang.en[key] ?? id.toString()
}

/** カスタム統計名を lang ファイルから解決する */
export function getCustomStatName(
  lang: { ja: Record<string, string>; en: Record<string, string> } | undefined,
  id: NamespacedId,
): string {
  if (!lang) return id.toString()
  // "minecraft:jump" → "stat.minecraft.jump"
  const key = id.langKey('stat')
  return lang.ja[key] ?? lang.en[key] ?? id.toString()
}

/** アドバンスメントID一覧をロードして名前付きエントリとして返す */
export function useMcAdvancements() {
  const langQuery = useMcLang()

  const advQuery = useQuery({
    queryKey: ['mc-advancements'],
    queryFn: () => fetchJson<string[]>('/mc/registry/advancement.json'),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const advancements: McItemEntry[] | undefined =
    advQuery.data && langQuery.data
      ? advQuery.data
          .filter((id) => !id.startsWith('recipes/') && !id.startsWith('minecraft:recipes/'))
          // registry は省略形を含むためここ（入力境界）で NamespacedId 化する
          .map((raw) => NamespacedId.parseUserInput(raw))
          .map((id) => ({
            id,
            name: getAdvancementName(langQuery.data, id),
          }))
      : undefined

  return {
    advancements,
    isLoading: advQuery.isLoading || langQuery.isLoading,
    lang: langQuery.data,
  }
}

/** カスタム統計ID一覧をロードして名前付きエントリとして返す */
export function useMcCustomStats() {
  const langQuery = useMcLang()

  const statQuery = useQuery({
    queryKey: ['mc-custom-stats'],
    queryFn: () => fetchJson<string[]>('/mc/registry/custom_stat.json'),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const stats: McItemEntry[] | undefined =
    statQuery.data && langQuery.data
      ? statQuery.data
          // registry は省略形を含むためここ（入力境界）で NamespacedId 化する
          .map((raw) => NamespacedId.parseUserInput(raw))
          .map((id) => ({
            id,
            name: getCustomStatName(langQuery.data, id),
          }))
      : undefined

  return {
    stats,
    isLoading: statQuery.isLoading || langQuery.isLoading,
    lang: langQuery.data,
  }
}

/** アイテムID一覧をロードして名前付きエントリとして返す */
export function useMcItems() {
  const langQuery = useMcLang()

  const itemsQuery = useQuery({
    queryKey: ['mc-items'],
    queryFn: () => fetchJson<string[]>('/mc/registry/item.json'),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const items: McItemEntry[] | undefined =
    itemsQuery.data && langQuery.data
      ? itemsQuery.data
          // registry は省略形 ("stone") のためここ（入力境界）で NamespacedId 化する
          .map((raw) => NamespacedId.parseUserInput(raw))
          .map((id) => ({
            id,
            name: getItemName(langQuery.data, id),
          }))
      : undefined

  return {
    items,
    isLoading: itemsQuery.isLoading || langQuery.isLoading,
    error: itemsQuery.error ?? langQuery.error,
    lang: langQuery.data,
  }
}

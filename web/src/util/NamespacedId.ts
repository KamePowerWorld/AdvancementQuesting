/**
 * Minecraftの名前空間付きID ("minecraft:stone") を表すクラス。
 *
 * このクラスの目的は、プロジェクト全体でID形式を統一することにより、
 * "minecraft:" プレフィックスの有無によるバグを仕組み的に防止することです。
 *
 * 基本的に `namespace:path` 形式（例: "minecraft:stone"）を使用します。
 * ユーザー入力等で省略された形式 ("stone") を扱う場合は {@link parseUserInput} を使用してください。
 *
 * @example
 * // 厳密パース（APIレスポンス等）
 * const id1 = NamespacedId.parse("minecraft:stone")
 *
 * // ユーザー入力（省略可）
 * const id2 = NamespacedId.parseUserInput("stone")  // -> minecraft:stone
 * const id3 = NamespacedId.parseUserInput("custommod:diamond")  // -> custommod:diamond
 *
 * // API境界で文字列出力
 * console.log(id2.toString())  // "minecraft:stone"
 */
export class NamespacedId {
  private constructor(
    /** 名前空間（例: "minecraft"） */
    private readonly namespace: string,
    /** パス（例: "stone"） */
    private readonly path: string,
  ) {}

  /**
   * namespace と path からインスタンスを構築します。
   */
  static of(namespace: string, path: string): NamespacedId {
    if (!namespace || namespace.length === 0) {
      throw new Error('namespace must not be empty')
    }
    if (!path || path.length === 0) {
      throw new Error('path must not be empty')
    }
    return new NamespacedId(namespace, path)
  }

  /**
   * 完全なID文字列 ("namespace:path") を厳密にパースします。
   * コロンが含まれていない場合は例外をスローします。
   *
   * 主にAPIレスポンス等、既に完全な形式であることが保証されている文字列用です。
   */
  static parse(fullId: string): NamespacedId {
    if (!fullId || fullId.length === 0) {
      throw new Error('fullId must not be empty')
    }
    const colonIndex = fullId.indexOf(':')
    if (colonIndex < 0) {
      throw new Error(`Invalid NamespacedId (missing ':'): ${fullId}`)
    }
    const namespace = fullId.slice(0, colonIndex)
    const path = fullId.slice(colonIndex + 1)
    if (!namespace || !path) {
      throw new Error(`Invalid NamespacedId (empty namespace or path): ${fullId}`)
    }
    return new NamespacedId(namespace, path)
  }

  /**
   * ユーザー入力用パース。コロンが含まれていない場合は "minecraft:" を補完します。
   *
   * ユーザーが手入力するフィールド等で、"stone" と入力した場合に
   * 自動的に "minecraft:stone" として扱うために使用します。
   *
   * @param input ユーザー入力文字列（省略可）
   */
  static parseUserInput(input: string): NamespacedId {
    if (!input || input.length === 0) {
      throw new Error('input must not be empty')
    }
    if (input.includes(':')) {
      return NamespacedId.parse(input)
    }
    return new NamespacedId('minecraft', input)
  }

  /**
   * "namespace:path" 形式の文字列を返します。
   * API境界等で文字列出力が必要な場合のみ使用してください。
   */
  toString(): string {
    return `${this.namespace}:${this.path}`
  }

  /** 等価性判定。ID比較は必ずこのメソッドを使用すること（toString()比較は禁止）。 */
  equals(other: NamespacedId): boolean {
    return this.namespace === other.namespace && this.path === other.path
  }

  /**
   * Minecraft言語ファイルのキーを生成します。
   * 例: langKey("item") → "item.minecraft.stone"
   */
  langKey(prefix: string): string {
    return `${prefix}.${this.namespace}.${this.path}`
  }

  /**
   * アイコンアトラス (misode/minecraft-render) のキーを生成します。
   * アトラスは minecraft 名前空間のみを収録しているため path ベースのキーを返します。
   * 例: atlasKey("item") → "item/stone"
   */
  atlasKey(prefix: 'item' | 'block'): string {
    return `${prefix}/${this.path}`
  }

  /**
   * アドバンスメント名の言語キーを生成します。
   * 例: "minecraft:story/mine_wood" → "advancements.story.mine_wood.title"
   */
  advancementLangKey(): string {
    return `advancements.${this.path.replace(/\//g, '.')}.title`
  }
}

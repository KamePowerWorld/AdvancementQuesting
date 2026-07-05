# NamespacedId統一実装計画

## Context

現在、プロジェクトではID形式が混在しています：
- イベント発火時: `NamespacedId.from().toString()` → `"minecraft:xxx"`
- 比較時: `McIds.stripNamespace()` → `"xxx"` で比較
- クエストJSON: 既に大部分が `"minecraft:xxx"` 形式で保存

この不一致により：
- NamespacedId を使った直後に stripNamespace する無駄が発生
- コードが一貫性を欠いている

**目的**: プロジェクト全体で NamespacedId 形式（`"minecraft:xxx"`）に統一し、`McIds.stripNamespace()` を排除する。

## 現状分析

### クエストJSONデータ形式（既にNamespacedId形式）

| フィールド | 現在の形式 | 備考 |
|-----------|-----------|------|
| `itemType` | `"minecraft:apple"` | ✅ namespace あり |
| `advancementId` | `"minecraft:story/mine_stone"` | ✅ namespace あり |
| `statType` | `"minecraft:mined"` | ✅ namespace あり |
| `statId` | `"minecraft:diamond"` | ✅ namespace あり |
| `dimension` | `"overworld"` | ⚠️ namespace なし（DimensionId専用） |
| `itemId` (報酬) | `"gold_ingot"` | ⚠️ namespace なし |

### データ移行の必要性

- ✅ **大部分のデータは既に NamespacedId 形式**: データ移行は不要
- ⚠️ **報酬の itemId のみ**: 必要に応じて移行

### コード変更対象

**McIds.stripNamespace() の使用箇所**:
1. `ProgressEventHandler.java` - advancement, item 条件の比較
2. `ConditionEvaluator.java` - advancement, item 条件の比較
3. `RewardManager.java` - `Material.matchMaterial()` のため（**正当な使用、維持**）
4. `McIdsTest.java` - テスト（**そのままOK**）

## 実装計画

### Phase 1: Javaコードの変更

#### 1.1 ProgressEventHandler.java

**変更内容**:
- `onAdvancement()`: `McIds.stripNamespace()` を削除し、`NamespacedId.parse()` で比較
- `onItemPickup()`: 同様に変更

**Before**:
```java
String advKeyNoNs = McIds.stripNamespace(advancementKey);
String condNoNs = McIds.stripNamespace(condAdvId);
return advKeyNoNs.equals(condNoNs);
```

**After**:
```java
NamespacedId eventId = NamespacedId.parse(advancementKey);
NamespacedId condId = NamespacedId.parse(condAdvId);
return eventId.equals(condId);
```

#### 1.2 ConditionEvaluator.java

**変更内容**:
- `applyAdvancement()`: stripNamespace を削除し、NamespacedId で比較
- `applyItem()`: 同様に変更

**Before**:
```java
String condNoNs = McIds.stripNamespace(condAdvId);
if (!condValue.equals(condNoNs)) continue;
```

**After**:
```java
NamespacedId condId = NamespacedId.parse(condAdvId);
NamespacedId valueId = NamespacedId.parse(condValue);
if (!valueId.equals(condId)) continue;
```

**注意**: メソッドシグネチャも変更する必要があります（`condValue` パラメータが String から NamespacedId に）

#### 1.3 呼び出し元の調整

`ConditionEvaluator.applyAdvancement()` の呼び出し元を調整し、String ではなく NamespacedId を渡すようにします。

### Phase 2: 報酬 itemId の対応（オプション）

報酬の `itemId` が namespace なし形式の場合、必要に応じて以下の対応を検討：

1. **データ移行スクリプト**: 既存の報酬データに namespace を付加
2. **または**: `RewardInterpreter` で `parseUserInput()` を使用し、互換性を保持

### Phase 3: NamespacedId の拡張

**NamespacedId.java に resolveMaterial() を追加**:
```java
public Material resolveMaterial() {
    return Material.matchMaterial(path().toUpperCase());
}
```

### Phase 4: ParsedReward の修正

**RewardInterpreter.ParsedReward**:
- `itemType()` が `String` ではなく `NamespacedId` を返すように変更

### Phase 5: RewardManager の修正

**RewardManager.java**:
- `resolveMaterial()` メソッドを削除
- 代わりに `NamespacedId.resolveMaterial()` を使用

### Phase 6: McIds.stripNamespace() の整理

- `McIdsTest.java`: **維持**（テストとしての価値あり）
- `McIds.stripNamespace()`: 使用箇所がなくなったら削除検討

### Phase 4: TypeScript側の対応

**web/src/util/NamespacedId.ts**:
- 既に作成済み
- APIレスポンスのIDを `NamespacedId.parse()` でパースして使用

**影響箇所**:
- `web/src/hooks/useMcData.ts`: `getItemName()` 等で既に namespace 処理あり（確認済み）
- `web/src/components/editor/...`: ItemIcon 等でID使用

## ファイル一覧

### 変更するファイル
1. `src/main/java/com/kamesuta/advquesting/data/ProgressEventHandler.java`
2. `src/main/java/com/kamesuta/advquesting/data/ConditionEvaluator.java`
3. 必要に応じて呼び出し元ファイル

### 変更するファイル（追加）
4. `src/main/java/com/kamesuta/advquesting/util/NamespacedId.java` - resolveMaterial() 追加
5. `src/main/java/com/kamesuta/advquesting/data/RewardInterpreter.java` - ParsedReward.itemType を NamespacedId に
6. `src/main/java/com/kamesuta/advquesting/data/RewardManager.java` - resolveMaterial() 削除、NamespacedId.resolveMaterial() 使用

### 変更しないファイル
1. `src/test/java/com/kamesuta/advquesting/data/McIdsTest.java` - テスト（McIds自体は残す）

### 参照ファイル（既存）
1. `src/main/java/com/kamesuta/advquesting/util/NamespacedId.java` - 既作成済み
2. `src/main/java/com/kamesuta/advquesting/util/DimensionId.java` - 既作成済み
3. `web/src/util/NamespacedId.ts` - 既作成済み

## 検証

### 単体テスト
- NamespacedId の等価性判定が正しく動作すること
- namespace あり/なし両方の形式で正しく比較できること

### 統合テスト
- mc-tests: 既存のテストが全てパスすること
- web E2E: 既存のテストが全てパスすること

### 手動テスト
1. クエストを作成して進捗が正しく記録されること
2. advancement/item/stat 条件が正しく完了すること
3. 報酬が正しく付与されること

## 注意点

1. **データ移行は不要**: 既存データは既に NamespacedId 形式
2. **dimension は DimensionId**: 専用enumとして扱う
3. **全てのアイテム・統計・stat は NamespacedId**: 例外なし
4. **NamespacedId.resolveMaterial()**: Bukkit API の Material.matchMaterial() をラップ
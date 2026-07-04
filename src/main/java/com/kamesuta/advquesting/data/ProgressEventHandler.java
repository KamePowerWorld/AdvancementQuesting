package com.kamesuta.advquesting.data;

/** Bukkit イベント起点の進捗チェック (Advancement・アイテム・統計・スコアボード・座標)。 */
class ProgressEventHandler {

    private final ProgressManager manager;

    ProgressEventHandler(ProgressManager manager) {
        this.manager = manager;
    }

    /**
     * Advancement 達成時に呼ぶ。
     * 一致する条件を持つクエストの進捗を更新し、全条件達成ならクエスト完了とする。
     */
    public void onAdvancement(String playerUuid, String advancementKey) {
        String advKeyNoNs = McIds.stripNamespace(advancementKey);
        try {
            for (Quest quest : manager.questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean matched = quest.conditions.stream().anyMatch(c -> {
                    if (!"advancement".equals(c.get("type"))) return false;
                    String condAdvId = (String) c.get("advancementId");
                    if (condAdvId == null) return false;
                    String condNoNs = McIds.stripNamespace(condAdvId);
                    return advKeyNoNs.equals(condNoNs);
                });
                if (matched) {
                    manager.progressUpdater.markConditionComplete(playerUuid, quest, "advancement", advKeyNoNs);
                }
            }
        } catch (Exception e) {
            manager.log.warning("onAdvancement error: " + e.getMessage());
        }
    }

    /**
     * アイテム獲得時に呼ぶ。inventoryCount はそのアイテムのインベントリ内現在所持数。
     */
    public void onItemPickup(String playerUuid, String itemType, int inventoryCount) {
        String itemTypeNoNs = McIds.stripNamespace(itemType);
        try {
            for (Quest quest : manager.questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c -> {
                    if (!"item".equals(c.get("type"))) return false;
                    String condItemType = (String) c.get("itemType");
                    if (condItemType == null) return false;
                    String condNoNs = McIds.stripNamespace(condItemType);
                    return itemTypeNoNs.equals(condNoNs);
                });
                if (hasMatch) {
                    manager.progressUpdater.updateItemProgress(playerUuid, quest, itemType, inventoryCount);
                }
            }
        } catch (Exception e) {
            manager.log.warning("onItemPickup error: " + e.getMessage());
        }
    }

    /**
     * 統計値が変化したとき呼ぶ。
     * @param statType  "minecraft:mined" など
     * @param statId    "minecraft:diamond" など
     * @param currentValue プレイヤーの現在の統計値 (累積値)
     */
    public void onStat(String playerUuid, String statType, String statId, int currentValue) {
        try {
            for (Quest quest : manager.questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c -> {
                    if (!"stat".equals(c.get("type"))) return false;
                    return statType.equals(c.get("statType")) && statId.equals(c.get("statId"));
                });
                if (hasMatch) {
                    manager.progressUpdater.updateStatProgress(playerUuid, quest, statType, statId, currentValue);
                }
            }
        } catch (Exception e) {
            manager.log.warning("onStat error: " + e.getMessage());
        }
    }

    /**
     * スコアボードのスコアが変化したとき呼ぶ。
     * @param objective スコアボード名
     * @param score     プレイヤーの現在スコア
     */
    public void onScoreChange(String playerUuid, String objective, int score) {
        try {
            for (Quest quest : manager.questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c ->
                    "scoreboard".equals(c.get("type")) && objective.equals(c.get("objective"))
                );
                if (hasMatch) {
                    manager.progressUpdater.updateScoreboardProgress(playerUuid, quest, objective, score);
                }
            }
        } catch (Exception e) {
            manager.log.warning("onScoreChange error: " + e.getMessage());
        }
    }

    /**
     * プレイヤーが移動したとき呼ぶ。
     * @param dimension "overworld" / "nether" / "end"
     */
    public void onPlayerMove(String playerUuid, int x, int y, int z, String dimension) {
        try {
            for (Quest quest : manager.questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c ->
                    "location".equals(c.get("type")) && dimension.equals(c.get("dimension"))
                );
                if (hasMatch) {
                    manager.progressUpdater.updateLocationProgress(playerUuid, quest, x, y, z, dimension);
                }
            }
        } catch (Exception e) {
            manager.log.warning("onPlayerMove error: " + e.getMessage());
        }
    }
}

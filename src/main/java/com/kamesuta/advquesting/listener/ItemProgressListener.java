package com.kamesuta.advquesting.listener;

import com.kamesuta.advquesting.data.ProgressManager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.inventory.FurnaceExtractEvent;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

/**
 * アイテム獲得（拾う・クラフト・かまど）を監視して item 条件の進捗を更新する。
 */
public class ItemProgressListener implements Listener {

    private final ProgressManager progressManager;

    public ItemProgressListener(ProgressManager progressManager) {
        this.progressManager = progressManager;
    }

    /** アイテムを拾ったとき */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;
        ItemStack item = event.getItem().getItemStack();
        String type = item.getType().getKey().toString(); // "minecraft:oak_log" 形式
        progressManager.onItemPickup(player.getUniqueId().toString(), type, item.getAmount());
    }

    /** クラフトで作ったとき */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        ItemStack result = event.getRecipe().getResult();
        int amount = result.getAmount();
        // Shift+クリックで一括クラフト
        if (event.isShiftClick()) {
            // 最大クラフト回数を概算 (上限64スタック分)
            amount = Math.min(amount * 64, 64);
        }
        String type = result.getType().getKey().toString(); // "minecraft:oak_log" 形式
        progressManager.onItemPickup(player.getUniqueId().toString(), type, amount);
    }

    /** かまどから取り出したとき */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onFurnaceExtract(FurnaceExtractEvent event) {
        String type = event.getItemType().getKey().toString(); // "minecraft:oak_log" 形式
        progressManager.onItemPickup(event.getPlayer().getUniqueId().toString(), type, event.getItemAmount());
    }
}

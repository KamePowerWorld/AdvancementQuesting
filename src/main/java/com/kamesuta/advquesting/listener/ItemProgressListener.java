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
        org.bukkit.Material mat = item.getType();
        String type = mat.getKey().toString();
        // 拾得後のインベントリ合計（拾う分を加算して計算）
        int inv = countInInventory(player, mat) + item.getAmount();
        progressManager.onItemPickup(player.getUniqueId().toString(), type, inv);
    }

    /** クラフトで作ったとき */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        ItemStack result = event.getRecipe().getResult();
        org.bukkit.Material mat = result.getType();
        String type = mat.getKey().toString();
        int inv = countInInventory(player, mat) + result.getAmount();
        progressManager.onItemPickup(player.getUniqueId().toString(), type, inv);
    }

    /** かまどから取り出したとき */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onFurnaceExtract(FurnaceExtractEvent event) {
        Player player = event.getPlayer();
        org.bukkit.Material mat = event.getItemType();
        String type = mat.getKey().toString();
        int inv = countInInventory(player, mat) + event.getItemAmount();
        progressManager.onItemPickup(player.getUniqueId().toString(), type, inv);
    }

    private static int countInInventory(Player player, org.bukkit.Material mat) {
        int total = 0;
        for (ItemStack slot : player.getInventory().getContents()) {
            if (slot != null && slot.getType() == mat) total += slot.getAmount();
        }
        return total;
    }
}

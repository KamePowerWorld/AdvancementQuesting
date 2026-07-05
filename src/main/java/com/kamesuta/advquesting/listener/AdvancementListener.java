package com.kamesuta.advquesting.listener;

import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.util.NamespacedId;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerAdvancementDoneEvent;

public class AdvancementListener implements Listener {

    private final ProgressManager progressManager;

    public AdvancementListener(ProgressManager progressManager) {
        this.progressManager = progressManager;
    }

    @EventHandler
    public void onAdvancement(PlayerAdvancementDoneEvent event) {
        // レシピ解除は除外 (minecraft:recipes/* は無視)
        String key = NamespacedId.from(event.getAdvancement()).toString();
        if (key.contains("recipes/")) return;

        String playerUuid = event.getPlayer().getUniqueId().toString();
        progressManager.onAdvancement(playerUuid, key);
    }
}

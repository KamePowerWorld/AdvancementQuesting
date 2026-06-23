package com.kamesuta.advquesting.listener;

import com.kamesuta.advquesting.data.AdvancementSyncManager;
import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public class PlayerJoinListener implements Listener {

    private final JavaPlugin plugin;
    private final AdvancementSyncManager advancementSyncManager;

    public PlayerJoinListener(JavaPlugin plugin, AdvancementSyncManager advancementSyncManager) {
        this.plugin = plugin;
        this.advancementSyncManager = advancementSyncManager;
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        // クライアントの受信準備を待って進捗を同期する
        Bukkit.getScheduler().runTaskLater(plugin, () ->
            advancementSyncManager.syncAllQuestsForPlayer(event.getPlayer()), 20L);
    }
}

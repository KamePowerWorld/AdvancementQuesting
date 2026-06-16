package com.kamesuta.advquesting.listener;

import com.kamesuta.advquesting.data.ProgressManager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerMoveEvent;

/**
 * プレイヤーが新しいブロック座標に移動したとき location 条件を確認する。
 * ブロック単位でのみ処理して負荷を抑える。
 */
public class LocationProgressListener implements Listener {

    private final ProgressManager progressManager;

    public LocationProgressListener(ProgressManager progressManager) {
        this.progressManager = progressManager;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        // ブロックが変わっていなければスキップ (負荷対策)
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockY() == event.getTo().getBlockY()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
            return;
        }

        String playerUuid = event.getPlayer().getUniqueId().toString();
        int x = event.getTo().getBlockX();
        int y = event.getTo().getBlockY();
        int z = event.getTo().getBlockZ();

        // ワールドキーを "overworld" / "nether" / "end" に正規化する
        String key = event.getTo().getWorld().getKey().getKey();
        String dimension = switch (key) {
            case "the_nether" -> "nether";
            case "the_end"    -> "end";
            default           -> "overworld";
        };

        progressManager.onPlayerMove(playerUuid, x, y, z, dimension);
    }
}

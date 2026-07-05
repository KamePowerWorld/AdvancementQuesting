package com.kamesuta.advquesting.listener;

import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.util.DimensionId;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerTeleportEvent;

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
        handleMove(event);
    }

    /**
     * テレポートで指定エリアに入った場合も location 条件を満たすものとして扱う。
     * PlayerTeleportEvent は PlayerMoveEvent のサブクラスだが Bukkit のイベント配送は
     * 厳密なクラス単位のため、onMove(PlayerMoveEvent) には届かない。明示的に受ける。
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        handleMove(event);
    }

    private void handleMove(PlayerMoveEvent event) {
        if (event.getTo() == null) return;

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

        // ワールドキーから DimensionId を取得して正規化名を取得
        DimensionId dimensionId = DimensionId.from(event.getTo().getWorld());
        String dimension = dimensionId.normalize();

        progressManager.onPlayerMove(playerUuid, x, y, z, dimension);
    }
}

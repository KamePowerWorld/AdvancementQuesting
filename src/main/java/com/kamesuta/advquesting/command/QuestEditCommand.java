package com.kamesuta.advquesting.command;

import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.data.Quest;
import com.kamesuta.advquesting.data.QuestManager;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * /quest_edit — 編集者・管理者向けのクエスト編集コマンド。
 * complete / uncomplete でプレイヤーのクエスト達成状態を強制設定する。
 * プレイヤー指定はターゲットセレクタ (@a, @p, @s, 名前) に対応する。
 */
public class QuestEditCommand implements CommandExecutor, TabCompleter {

    private final ProgressManager progressManager;
    private final QuestManager questManager;

    public QuestEditCommand(ProgressManager progressManager, QuestManager questManager) {
        this.progressManager = progressManager;
        this.questManager = questManager;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        // 権限チェックは plugin.yml の permission: aq.editor により Bukkit が行う
        if (args.length == 0) {
            sendUsage(sender);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "complete" -> handleSetCompleted(sender, args, true);
            case "uncomplete" -> handleSetCompleted(sender, args, false);
            default -> sendUsage(sender);
        }
        return true;
    }

    private void sendUsage(CommandSender sender) {
        sender.sendMessage(Component.text(
            "使い方: /quest_edit <complete|uncomplete> <プレイヤー|@a|@p|@s> <クエストID>",
            NamedTextColor.RED));
    }

    private void handleSetCompleted(CommandSender sender, String[] args, boolean completed) {
        if (args.length < 3) {
            sendUsage(sender);
            return;
        }
        String selector = args[1];
        int questId;
        try {
            questId = Integer.parseInt(args[2]);
        } catch (NumberFormatException e) {
            sender.sendMessage(Component.text("クエストIDは数字で指定してください。", NamedTextColor.RED));
            return;
        }

        Quest quest = questManager.findById(questId);
        if (quest == null) {
            sender.sendMessage(Component.text("クエストが見つかりません: #" + questId, NamedTextColor.RED));
            return;
        }

        // 対象プレイヤーを解決する
        List<Player> targets = resolveTargets(sender, selector);
        if (targets.isEmpty()) {
            sender.sendMessage(Component.text("対象プレイヤーが見つかりません: " + selector, NamedTextColor.RED));
            return;
        }

        int success = 0;
        for (Player target : targets) {
            try {
                if (progressManager.setQuestCompleted(target.getUniqueId().toString(), questId, completed)) {
                    success++;
                }
            } catch (SQLException e) {
                sender.sendMessage(Component.text(
                    target.getName() + " の更新に失敗しました。", NamedTextColor.RED));
            }
        }

        String state = completed ? "達成済み" : "未達成";
        if (targets.size() == 1) {
            sender.sendMessage(Component.text(
                targets.get(0).getName() + " のクエスト「" + quest.title + "」を" + state + "にしました。",
                NamedTextColor.GREEN));
        } else {
            sender.sendMessage(Component.text(
                success + " 人のクエスト「" + quest.title + "」を" + state + "にしました。",
                NamedTextColor.GREEN));
        }
    }

    /**
     * セレクタ (@a, @p, @s, 座標付き等) または通常のプレイヤー名から対象プレイヤーを解決する。
     * オンラインプレイヤーのみが対象 (達成状態の通知/演出を即時反映するため)。
     */
    private List<Player> resolveTargets(CommandSender sender, String selector) {
        List<Player> result = new ArrayList<>();
        if (selector.startsWith("@")) {
            try {
                for (Entity e : Bukkit.selectEntities(sender, selector)) {
                    if (e instanceof Player p) result.add(p);
                }
            } catch (IllegalArgumentException ex) {
                // 不正なセレクタ → 空のまま返す
            }
        } else {
            Player p = Bukkit.getPlayerExact(selector);
            if (p != null) result.add(p);
        }
        return result;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String label, String[] args) {
        // 権限がない場合 Bukkit はそもそも補完を呼ばないため、ここでのチェックは不要
        if (args.length == 1) {
            String prefix = args[0].toLowerCase();
            return java.util.stream.Stream.of("complete", "uncomplete")
                .filter(s -> s.startsWith(prefix))
                .toList();
        }

        // <player|@selector> 補完: オンラインプレイヤー名 + セレクタ
        if (args.length == 2) {
            String prefix = args[1].toLowerCase();
            List<String> opts = new ArrayList<>();
            opts.add("@a");
            opts.add("@p");
            opts.add("@s");
            opts.add("@r");
            for (Player p : Bukkit.getOnlinePlayers()) opts.add(p.getName());
            return opts.stream().filter(s -> s.toLowerCase().startsWith(prefix)).toList();
        }

        // <questId> 補完: 既存クエストのID一覧
        if (args.length == 3) {
            String prefix = args[2];
            return questManager.loadAll().stream()
                .map(q -> String.valueOf(q.id))
                .filter(s -> s.startsWith(prefix))
                .toList();
        }
        return List.of();
    }
}

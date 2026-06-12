package com.kamesuta.advquesting.command;

import com.kamesuta.advquesting.db.AuthCodeDao;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

public class QuestCommand implements CommandExecutor, TabCompleter {

    private final AuthCodeDao authCodeDao;
    private final String webUrl;

    public QuestCommand(AuthCodeDao authCodeDao, String webUrl) {
        this.authCodeDao = authCodeDao;
        this.webUrl = webUrl;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            // /quest — コード付きログインURLを表示
            if (sender instanceof Player player) {
                String code = String.format("%06d", ThreadLocalRandom.current().nextInt(1_000_000));
                String role = determineRole(player);
                Instant expiresAt = Instant.now().plusSeconds(300);
                try {
                    authCodeDao.insert(code, player.getUniqueId().toString(), player.getName(), role, expiresAt);
                } catch (SQLException e) {
                    player.sendMessage(Component.text("URLの生成に失敗しました。", NamedTextColor.RED));
                    return true;
                }
                String loginUrl = webUrl + "/login?code=" + code;
                player.sendMessage(Component.text("クエストマップを開く: ", NamedTextColor.GOLD)
                    .append(Component.text(loginUrl, NamedTextColor.AQUA)
                        .clickEvent(ClickEvent.openUrl(loginUrl))
                        .decorate(TextDecoration.UNDERLINED)));
                player.sendMessage(Component.text("URLをクリックするとそのままログインできます。", NamedTextColor.GRAY));
            } else {
                sender.sendMessage(Component.text("Web UI: ", NamedTextColor.GOLD)
                    .append(Component.text(webUrl, NamedTextColor.AQUA)
                        .clickEvent(ClickEvent.openUrl(webUrl))
                        .decorate(TextDecoration.UNDERLINED)));
            }
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "code" -> handleCode(sender);
            default -> sender.sendMessage(Component.text("使い方: /quest [code]", NamedTextColor.RED));
        }
        return true;
    }

    private void handleCode(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("プレイヤーのみ使用できます。", NamedTextColor.RED));
            return;
        }
        String code = String.format("%06d", ThreadLocalRandom.current().nextInt(1_000_000));
        String role = determineRole(player);
        Instant expiresAt = Instant.now().plusSeconds(300);
        try {
            authCodeDao.insert(code, player.getUniqueId().toString(), player.getName(), role, expiresAt);
        } catch (SQLException e) {
            player.sendMessage(Component.text("コードの生成に失敗しました。", NamedTextColor.RED));
            return;
        }
        player.sendMessage(Component.text("認証コード: ", NamedTextColor.GOLD)
            .append(Component.text(code, NamedTextColor.WHITE).decorate(TextDecoration.BOLD)));
        player.sendMessage(Component.text("有効期限: 5分", NamedTextColor.GRAY));
        player.sendMessage(Component.text("Web UI でコードを入力してください: ", NamedTextColor.GRAY)
            .append(Component.text(webUrl, NamedTextColor.AQUA)
                .clickEvent(ClickEvent.openUrl(webUrl))
                .decorate(TextDecoration.UNDERLINED)));
    }

    private String determineRole(Player player) {
        if (player.isOp() || player.hasPermission("aq.admin")) return "admin";
        if (player.hasPermission("aq.editor")) return "editor";
        return "player";
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 1) return List.of("code");
        return List.of();
    }
}

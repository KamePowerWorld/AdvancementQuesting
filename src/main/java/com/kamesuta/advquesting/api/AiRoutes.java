package com.kamesuta.advquesting.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.ForbiddenResponse;
import io.javalin.http.HttpResponseException;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public class AiRoutes {

    private static final String OPENAI_URL = "https://api.openai.com/v1/responses";

    /** プロンプトの保存先 (plugins/AdvancementQuesting/prompt.txt)。編集者全員で共有する。 */
    private static final String PROMPT_FILE = "prompt.txt";

    /** prompt.txt が無い場合に書き出される初期プロンプト。 */
    private static final String DEFAULT_PROMPT = """
            あなたはマインクラフトのクエスト作成を補助するアシスタントです。
            与えられたタスク（達成条件）と報酬の内容を踏まえ、プレイヤーがワクワクする
            クエスト名と説明文を日本語で提案してください。

            ファンタジー世界観とユーモアを大切にし、物語を進めているような
            没入感のある表現にしてください。「マナ理論」のように世界観を感じさせる
            言葉を取り入れると魅力的です。

            クエスト名は20文字程度まで。
            説明文は400文字程度の、読み応えのある物語的な文章にしてください。
            内容はタスクや報酬と矛盾しないようにしてください。

            すでにクエスト名や説明文が入力されている場合は、それを完全に作り直すのではなく、
            入力されている内容の意図や雰囲気を活かして、より魅力的に改善・修正した案を
            提案してください。

            候補は必ず3件、互いに毛色の違うものにしてください。
            """;

    private final JavaPlugin plugin;
    private final SessionDao sessionDao;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public AiRoutes(JavaPlugin plugin, SessionDao sessionDao) {
        this.plugin = plugin;
        this.sessionDao = sessionDao;
    }

    public record SuggestRequest(
            List<String> tasks,
            List<String> rewards,
            List<ChatMsg> messages,
            String currentTitle,
            String currentSubtitle,
            String currentDescription
    ) {}

    public record ChatMsg(String role, String content) {}
    public record Candidate(String title, String description) {}
    public record CandidateResponse(List<Candidate> candidates) {}
    public record PromptBody(String prompt) {}

    public void register(Javalin app) {
        // POST /api/ai/quest-suggest — editor 以上
        app.post("/api/ai/quest-suggest", ctx -> {
            requireEditor(ctx);

            String apiKey = plugin.getConfig().getString("openai-api-key", "");
            if (apiKey == null || apiKey.isBlank()) {
                throw new HttpResponseException(503,
                        "AI機能が無効です（config.yml に openai-api-key を設定してください）",
                        Map.of());
            }

            SuggestRequest req = ctx.bodyAsClass(SuggestRequest.class);
            String model = plugin.getConfig().getString("openai-model", "gpt-5-mini");

            JsonNode candidates = callOpenAi(apiKey, model, req);

            ObjectNode result = mapper.createObjectNode();
            result.set("candidates", candidates);
            ctx.json(result);
        });

        // GET /api/ai/prompt — 現在のプロンプトを取得 (editor 以上)
        app.get("/api/ai/prompt", ctx -> {
            requireEditor(ctx);
            ObjectNode result = mapper.createObjectNode();
            result.put("prompt", loadPrompt());
            ctx.json(result);
        });

        // PUT /api/ai/prompt — プロンプトを保存 (editor 以上・全員で共有)
        app.put("/api/ai/prompt", ctx -> {
            requireEditor(ctx);
            PromptBody body = ctx.bodyAsClass(PromptBody.class);
            String prompt = body.prompt() == null ? "" : body.prompt();
            savePrompt(prompt);
            ObjectNode result = mapper.createObjectNode();
            result.put("prompt", prompt);
            ctx.json(result);
        });
    }

    private void requireEditor(io.javalin.http.Context ctx) throws java.sql.SQLException {
        SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
        if (!session.isEditor()) throw new ForbiddenResponse();
    }

    // -------------------------------------------------------------------------
    // プロンプト (prompt.txt) の読み書き
    // -------------------------------------------------------------------------

    private File promptFile() {
        return new File(plugin.getDataFolder(), PROMPT_FILE);
    }

    /** prompt.txt を読み込む。無ければ初期プロンプトを書き出して返す。 */
    private String loadPrompt() {
        File f = promptFile();
        if (!f.exists()) {
            savePromptQuietly(DEFAULT_PROMPT);
            return DEFAULT_PROMPT;
        }
        try {
            return Files.readString(f.toPath(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            plugin.getLogger().warning("prompt.txt の読み込みに失敗しました: " + e.getMessage());
            return DEFAULT_PROMPT;
        }
    }

    private void savePrompt(String prompt) {
        try {
            plugin.getDataFolder().mkdirs();
            Files.writeString(promptFile().toPath(), prompt, StandardCharsets.UTF_8);
        } catch (IOException e) {
            plugin.getLogger().warning("prompt.txt の保存に失敗しました: " + e.getMessage());
            throw new HttpResponseException(500, "プロンプトの保存に失敗しました", Map.of());
        }
    }

    private void savePromptQuietly(String prompt) {
        try {
            plugin.getDataFolder().mkdirs();
            Files.writeString(promptFile().toPath(), prompt, StandardCharsets.UTF_8);
        } catch (IOException e) {
            plugin.getLogger().warning("prompt.txt の初期化に失敗しました: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // OpenAI 呼び出し
    // -------------------------------------------------------------------------

    private JsonNode callOpenAi(String apiKey, String model, SuggestRequest req) {
        ArrayNode input = mapper.createArrayNode();

        input.add(msg("system", loadPrompt()));
        input.add(msg("user", buildContext(req)));

        // 会話履歴はユーザーのヒントのみ送る (assistant の差し戻しはしない)。
        // Responses API では assistant ロールの content 型が異なるため、
        // すべて user ロールの追加指示として渡すことで安定動作させる。
        if (req.messages() != null) {
            for (ChatMsg m : req.messages()) {
                if (m == null || m.content() == null || m.content().isBlank()) continue;
                input.add(msg("user", m.content()));
            }
        }

        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.set("input", input);

        ObjectNode text = mapper.createObjectNode();
        ObjectNode format = mapper.createObjectNode();

        format.put("type", "json_schema");
        format.put("name", "quest_candidates");
        format.put("strict", true);

        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");

        ObjectNode properties = mapper.createObjectNode();

        ObjectNode candidates = mapper.createObjectNode();
        candidates.put("type", "array");

        ObjectNode item = mapper.createObjectNode();
        item.put("type", "object");

        ObjectNode itemProps = mapper.createObjectNode();
        itemProps.putObject("title").put("type", "string");
        itemProps.putObject("description").put("type", "string");

        item.set("properties", itemProps);

        ArrayNode itemRequired = mapper.createArrayNode();
        itemRequired.add("title");
        itemRequired.add("description");
        item.set("required", itemRequired);
        item.put("additionalProperties", false);

        candidates.set("items", item);
        properties.set("candidates", candidates);

        schema.set("properties", properties);

        ArrayNode required = mapper.createArrayNode();
        required.add("candidates");
        schema.set("required", required);
        schema.put("additionalProperties", false);

        format.set("schema", schema);
        text.set("format", format);
        body.set("text", text);

        try {
            HttpRequest httpReq = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_URL))
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> resp =
                    httpClient.send(httpReq, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() / 100 != 2) {
                plugin.getLogger().warning(
                        "OpenAI がエラーを返しました (" +
                                resp.statusCode() + "): " + resp.body());
                throw new HttpResponseException(
                        502,
                        "AI提案の生成に失敗しました（OpenAIエラー）",
                        Map.of()
                );
            }

            JsonNode root = mapper.readTree(resp.body());

            String json = root.path("output")
                    .path(0)
                    .path("content")
                    .path(0)
                    .path("text")
                    .asText();

            CandidateResponse parsed =
                    mapper.readValue(json, CandidateResponse.class);

            return mapper.valueToTree(parsed.candidates());

        } catch (HttpResponseException e) {
            throw e;
        } catch (Exception e) {
            plugin.getLogger().warning(
                    "OpenAI 応答の解析に失敗しました: " + e.getMessage());
            throw new HttpResponseException(
                    502,
                    "AI提案の生成に失敗しました",
                    Map.of()
            );
        }
    }

    private static String buildContext(SuggestRequest req) {
        StringBuilder sb = new StringBuilder();

        sb.append("以下のクエストにふさわしいクエスト名と説明文を提案してください。\n\n");

        sb.append("【タスク（達成条件）】\n");
        if (req.tasks() != null && !req.tasks().isEmpty()) {
            for (String t : req.tasks()) {
                sb.append("- ").append(t).append("\n");
            }
        } else {
            sb.append("（未設定）\n");
        }

        sb.append("\n【報酬】\n");
        if (req.rewards() != null && !req.rewards().isEmpty()) {
            for (String r : req.rewards()) {
                sb.append("- ").append(r).append("\n");
            }
        } else {
            sb.append("（未設定）\n");
        }

        // 既に入力済みの内容があれば「修正案」として活かす
        String title = trimToNull(req.currentTitle());
        boolean hasTitle = title != null && !title.equals("新規クエスト");
        String subtitle = trimToNull(req.currentSubtitle());
        String description = trimToNull(req.currentDescription());

        if (hasTitle || subtitle != null || description != null) {
            sb.append("\n【現在入力されている内容（完全に作り直さず、これを活かして改善・修正してください）】\n");
            if (hasTitle) sb.append("クエスト名: ").append(title).append("\n");
            if (subtitle != null) sb.append("補足: ").append(subtitle).append("\n");
            if (description != null) sb.append("説明: ").append(description).append("\n");
        }

        return sb.toString();
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private ObjectNode msg(String role, String content) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", role);

        ArrayNode contentArray = mapper.createArrayNode();

        ObjectNode text = mapper.createObjectNode();
        text.put("type", "input_text");
        text.put("text", content);

        contentArray.add(text);
        msg.set("content", contentArray);

        return msg;
    }
}

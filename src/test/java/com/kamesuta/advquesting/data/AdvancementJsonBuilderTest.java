package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** {@link AdvancementJsonBuilder} のキャラクタリゼーションテスト。 */
class AdvancementJsonBuilderTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @TempDir
    File tempDir;

    private QuestManager questManager;
    private AdvancementJsonBuilder builder;

    @BeforeEach
    void setUp() {
        questManager = new QuestManager(tempDir);
        builder = new AdvancementJsonBuilder(questManager, () -> "https://example.com");
    }

    // ================================================================
    // escapeJson
    // ================================================================

    @Test
    void escapeJson_quotes() {
        assertEquals("\\\"hello\\\"", AdvancementJsonBuilder.escapeJson("\"hello\""));
    }

    @Test
    void escapeJson_backslash() {
        assertEquals("a\\\\b", AdvancementJsonBuilder.escapeJson("a\\b"));
    }

    @Test
    void escapeJson_newline() {
        assertEquals("line1\\nline2", AdvancementJsonBuilder.escapeJson("line1\nline2"));
    }

    @Test
    void escapeJson_tab() {
        assertEquals("col1\\tcol2", AdvancementJsonBuilder.escapeJson("col1\tcol2"));
    }

    @Test
    void escapeJson_null() {
        assertEquals("", AdvancementJsonBuilder.escapeJson(null));
    }

    // ================================================================
    // sanitizeCriterionName
    // ================================================================

    @Test
    void sanitizeCriterionName_nonAlphanumericToUnderscore() {
        assertEquals("hello_world_", AdvancementJsonBuilder.sanitizeCriterionName("hello world!"));
    }

    @Test
    void sanitizeCriterionName_allowedChars() {
        assertEquals("abc_123-XYZ", AdvancementJsonBuilder.sanitizeCriterionName("abc_123-XYZ"));
    }

    @Test
    void sanitizeCriterionName_japanese() {
        assertEquals("c1__", AdvancementJsonBuilder.sanitizeCriterionName("c1あ日"));
    }

    // ================================================================
    // toMinecraftItem
    // ================================================================

    @Test
    void toMinecraftItem_null() {
        assertEquals("minecraft:map", AdvancementJsonBuilder.toMinecraftItem(null));
    }

    @Test
    void toMinecraftItem_blank() {
        assertEquals("minecraft:map", AdvancementJsonBuilder.toMinecraftItem("   "));
    }

    @Test
    void toMinecraftItem_noNamespace_fallsBackToMap() {
        // 省略形はマイグレーション済みの前提。補完はせずデフォルトへフォールバックする
        assertEquals("minecraft:map", AdvancementJsonBuilder.toMinecraftItem("Diamond"));
    }

    @Test
    void toMinecraftItem_withNamespace_passthrough() {
        assertEquals("custom:sword", AdvancementJsonBuilder.toMinecraftItem("custom:sword"));
    }

    // ================================================================
    // parseProgress
    // ================================================================

    @Test
    void parseProgress_null() {
        assertTrue(AdvancementJsonBuilder.parseProgress(null).isEmpty());
    }

    @Test
    void parseProgress_blank() {
        assertTrue(AdvancementJsonBuilder.parseProgress("   ").isEmpty());
    }

    @Test
    void parseProgress_malformedJson() {
        assertTrue(AdvancementJsonBuilder.parseProgress("{not json}").isEmpty());
    }

    @Test
    void parseProgress_normalCase() {
        String json = "[{\"conditionId\":\"c1\",\"completed\":true},{\"conditionId\":\"c2\",\"completed\":false}]";
        Map<String, Boolean> result = AdvancementJsonBuilder.parseProgress(json);
        assertEquals(2, result.size());
        assertTrue(result.get("c1"));
        assertFalse(result.get("c2"));
    }

    // ================================================================
    // buildAdvancementJson
    // ================================================================

    @Test
    void buildAdvancementJson_criteriaNamedWithCPrefix() throws Exception {
        Quest quest = new Quest();
        quest.id = 1;
        quest.title = "Test Quest";
        quest.status = "public";
        quest.conditions = List.of(
                Map.of("id", "cond1"),
                Map.of("id", "my condition!")
        );

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);

        JsonNode criteria = root.get("criteria");
        assertNotNull(criteria.get("c_cond1"));
        assertNotNull(criteria.get("c_my_condition_"));
    }

    @Test
    void buildAdvancementJson_emptyConditions_rootCriterion() throws Exception {
        Quest quest = new Quest();
        quest.id = 2;
        quest.title = "No Conditions";
        quest.status = "public";
        quest.conditions = List.of();

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);

        JsonNode criteria = root.get("criteria");
        assertNotNull(criteria.get("_root"));
    }

    @Test
    void buildAdvancementJson_noPrereqs_parentIsRoot() throws Exception {
        Quest quest = new Quest();
        quest.id = 3;
        quest.title = "Quest";
        quest.status = "public";

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);

        assertEquals("advquesting:root", root.get("parent").asText());
    }

    @Test
    void buildAdvancementJson_prereqPublic_parentIsQuestKey() throws Exception {
        // Create prerequisite quest on disk
        Quest prereq = new Quest();
        prereq.title = "Prereq";
        prereq.status = "public";
        try {
            prereq = questManager.create(prereq);
        } catch (IOException e) {
            fail("Could not create prereq quest: " + e.getMessage());
        }
        int prereqId = prereq.id;

        Quest quest = new Quest();
        quest.id = 99;
        quest.title = "Dependent Quest";
        quest.status = "public";
        quest.prerequisites = List.of(prereqId);

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);

        assertEquals("advquesting:q" + prereqId, root.get("parent").asText());
    }

    @Test
    void buildAdvancementJson_prereqNotPublic_parentIsRoot() throws Exception {
        // Create a non-public prerequisite
        Quest prereq = new Quest();
        prereq.title = "Draft Prereq";
        prereq.status = "draft";
        try {
            prereq = questManager.create(prereq);
        } catch (IOException e) {
            fail("Could not create prereq quest: " + e.getMessage());
        }
        int prereqId = prereq.id;

        Quest quest = new Quest();
        quest.id = 100;
        quest.title = "Dependent Quest";
        quest.status = "public";
        quest.prerequisites = List.of(prereqId);

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);

        assertEquals("advquesting:root", root.get("parent").asText());
    }

    @Test
    void buildAdvancementJson_titleFallback() throws Exception {
        Quest quest = new Quest();
        quest.id = 42;
        quest.title = null;
        quest.status = "public";

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);

        assertEquals("クエスト #42", root.get("display").get("title").get("text").asText());
    }

    @Test
    void buildAdvancementJson_descriptionContainsConditionCount() throws Exception {
        Quest quest = new Quest();
        quest.id = 5;
        quest.title = "Quest";
        quest.status = "public";
        quest.conditions = List.of(
                Map.of("id", "c1"),
                Map.of("id", "c2"),
                Map.of("id", "c3")
        );

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);
        String desc = root.get("display").get("description").get("text").asText();

        assertTrue(desc.contains("全3つの条件"), "Expected '全3つの条件' in: " + desc);
    }

    @Test
    void buildAdvancementJson_urlStripping() throws Exception {
        // builder uses "https://example.com" supplier → display url = "example.com"
        Quest quest = new Quest();
        quest.id = 6;
        quest.title = "Quest";
        quest.status = "public";

        String json = builder.buildAdvancementJson(quest);
        JsonNode root = MAPPER.readTree(json);
        String desc = root.get("display").get("description").get("text").asText();

        assertFalse(desc.contains("https://"), "https:// should be stripped");
        assertTrue(desc.contains("example.com"), "Expected 'example.com' in: " + desc);
    }
}

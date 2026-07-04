package com.kamesuta.advquesting.data;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class McIdsTest {

    @Test
    void stripNamespaceは名前空間を除去する() {
        assertEquals("diamond", McIds.stripNamespace("minecraft:diamond"));
    }

    @Test
    void stripNamespaceは名前空間なしをそのまま返す() {
        assertEquals("diamond", McIds.stripNamespace("diamond"));
    }

    @Test
    void stripNamespaceは複数コロンで最初のコロンまでを除去する() {
        assertEquals("story/mine:stone", McIds.stripNamespace("minecraft:story/mine:stone"));
    }
}

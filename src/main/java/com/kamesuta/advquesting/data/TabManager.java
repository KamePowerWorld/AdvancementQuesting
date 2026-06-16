package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class TabManager {

    private static final ObjectMapper MAPPER = new ObjectMapper()
        .enable(SerializationFeature.INDENT_OUTPUT);

    public record TabRecord(String name, int order, String createdAt, String updatedAt) {}

    private final File tabsFile;
    private final QuestManager questManager;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    public TabManager(File dataFolder, QuestManager questManager) {
        this.tabsFile = new File(dataFolder, "tabs.json");
        this.questManager = questManager;
    }

    public List<TabRecord> loadAll() {
        lock.writeLock().lock();
        try {
            List<TabRecord> tabs = readTabs();
            if (!tabsFile.exists() && !tabs.isEmpty()) {
                writeTabs(tabs);
            }
            return tabs;
        } catch (IOException e) {
            return List.of();
        } finally {
            lock.writeLock().unlock();
        }
    }

    public TabRecord create(String name) throws IOException {
        lock.writeLock().lock();
        try {
            List<TabRecord> tabs = readTabs();
            boolean exists = tabs.stream().anyMatch(tab -> tab.name().equals(name));
            if (exists) return null;
            TabRecord created = new TabRecord(name, tabs.size(), Instant.now().toString(), Instant.now().toString());
            tabs.add(created);
            writeTabs(tabs);
            return created;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public List<TabRecord> reorder(List<String> names) throws IOException {
        lock.writeLock().lock();
        try {
            List<TabRecord> tabs = readTabs();
            List<TabRecord> reordered = new ArrayList<>();
            for (int i = 0; i < names.size(); i++) {
                String name = names.get(i);
                TabRecord existing = tabs.stream().filter(tab -> tab.name().equals(name)).findFirst().orElse(null);
                if (existing != null) {
                    reordered.add(new TabRecord(existing.name(), i, existing.createdAt(), Instant.now().toString()));
                }
            }
            writeTabs(reordered);
            return reordered;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean delete(String name) throws IOException {
        lock.writeLock().lock();
        try {
            List<TabRecord> tabs = readTabs();
            boolean removed = tabs.removeIf(tab -> tab.name().equals(name));
            if (!removed) return false;
            for (int i = 0; i < tabs.size(); i++) {
                TabRecord tab = tabs.get(i);
                tabs.set(i, new TabRecord(tab.name(), i, tab.createdAt(), Instant.now().toString()));
            }
            writeTabs(tabs);
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }

    private List<TabRecord> readTabs() throws IOException {
        if (tabsFile.exists()) {
            TabRecord[] tabs = MAPPER.readValue(tabsFile, TabRecord[].class);
            return new ArrayList<>(List.of(tabs));
        }
        Set<String> names = new LinkedHashSet<>();
        for (Quest quest : questManager.loadAll()) {
            if (quest.category != null && !quest.category.isBlank()) {
                names.add(quest.category);
            }
        }
        List<TabRecord> tabs = new ArrayList<>();
        int i = 0;
        for (String name : names) {
            tabs.add(new TabRecord(name, i++, Instant.now().toString(), Instant.now().toString()));
        }
        return tabs;
    }

    private void writeTabs(List<TabRecord> tabs) throws IOException {
        tabsFile.getParentFile().mkdirs();
        MAPPER.writeValue(tabsFile, tabs);
    }
}

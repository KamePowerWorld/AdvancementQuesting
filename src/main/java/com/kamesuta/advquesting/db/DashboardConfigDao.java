package com.kamesuta.advquesting.db;

import java.sql.*;
import java.time.Instant;

/** ダッシュボード設定 (dashboard_configs) の DAO。単一行 (key='default') を読み書きする。 */
public class DashboardConfigDao {

    private static final String DEFAULT_KEY = "default";
    private static final String DEFAULT_JSON = "{\"widgets\":[]}";

    private final DatabaseManager db;

    public DashboardConfigDao(DatabaseManager db) {
        this.db = db;
    }

    public String getConfigJson() throws SQLException {
        String sql = "SELECT config_json FROM dashboard_configs WHERE key = ?";
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, DEFAULT_KEY);
            ResultSet rs = ps.executeQuery();
            if (rs.next()) return rs.getString(1);
            return DEFAULT_JSON;
        }
    }

    public void setConfigJson(String json) throws SQLException {
        String sql = "INSERT OR REPLACE INTO dashboard_configs (key, config_json, updated_at) VALUES (?, ?, ?)";
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, DEFAULT_KEY);
            ps.setString(2, json);
            ps.setString(3, Instant.now().toString());
            ps.executeUpdate();
        }
    }
}

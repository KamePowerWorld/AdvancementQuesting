package com.kamesuta.advquesting.db;

import java.sql.SQLException;
import java.time.Instant;

/** ダッシュボード設定 (dashboard_configs) の DAO。単一行 (key='default') を読み書きする。 */
public class DashboardConfigDao extends BaseDao {

    private static final String DEFAULT_KEY = "default";
    private static final String DEFAULT_JSON = "{\"widgets\":[]}";

    public DashboardConfigDao(DatabaseManager db) {
        super(db);
    }

    public String getConfigJson() throws SQLException {
        String json = queryOne("SELECT config_json FROM dashboard_configs WHERE key = ?",
            rs -> rs.getString(1), DEFAULT_KEY);
        return json != null ? json : DEFAULT_JSON;
    }

    public void setConfigJson(String json) throws SQLException {
        update("INSERT OR REPLACE INTO dashboard_configs (key, config_json, updated_at) VALUES (?, ?, ?)",
            DEFAULT_KEY, json, Instant.now().toString());
    }
}

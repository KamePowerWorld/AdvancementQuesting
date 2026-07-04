package com.kamesuta.advquesting.db;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO 基底クラス。JDBC の定型 (prepare → bind → execute → map) を共通化する。
 * パラメータは setObject でバインドする (String / Integer / Long / null を想定)。
 * boolean は呼び出し側で 0/1 に変換して渡すこと (SQLite の既存カラム表現に合わせる)。
 */
public abstract class BaseDao {

    @FunctionalInterface
    public interface RowMapper<T> {
        T map(ResultSet rs) throws SQLException;
    }

    protected final DatabaseManager db;

    protected BaseDao(DatabaseManager db) {
        this.db = db;
    }

    /** SELECT: 全行を mapper で変換したリストを返す */
    protected <T> List<T> queryList(String sql, RowMapper<T> mapper, Object... params) throws SQLException {
        try (PreparedStatement ps = prepare(sql, params); ResultSet rs = ps.executeQuery()) {
            List<T> list = new ArrayList<>();
            while (rs.next()) list.add(mapper.map(rs));
            return list;
        }
    }

    /** SELECT: 先頭行を mapper で変換して返す (0行なら null) */
    protected <T> T queryOne(String sql, RowMapper<T> mapper, Object... params) throws SQLException {
        try (PreparedStatement ps = prepare(sql, params); ResultSet rs = ps.executeQuery()) {
            return rs.next() ? mapper.map(rs) : null;
        }
    }

    /** INSERT / UPDATE / DELETE: 影響行数を返す */
    protected int update(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = prepare(sql, params)) {
            return ps.executeUpdate();
        }
    }

    /** INSERT: 自動採番されたキーを返す */
    protected int insertReturningKey(String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            bind(ps, params);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) return keys.getInt(1);
            }
            throw new SQLException("Failed to get generated key");
        }
    }

    private PreparedStatement prepare(String sql, Object... params) throws SQLException {
        PreparedStatement ps = db.getConnection().prepareStatement(sql);
        try {
            bind(ps, params);
            return ps;
        } catch (SQLException e) {
            ps.close();
            throw e;
        }
    }

    private void bind(PreparedStatement ps, Object... params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            ps.setObject(i + 1, params[i]);
        }
    }
}

package com.kamesuta.advquesting.data;

import java.util.List;
import java.util.Map;

/**
 * クエスト定義。JSON ファイルと 1:1 対応する。
 * Jackson でシリアライズ/デシリアライズする。
 */
public class Quest {

    public int id;
    public String title;
    public String subtitle;
    public String description;
    public String icon;
    public String category;
    public List<Integer> prerequisites;
    public List<Map<String, Object>> conditions;
    public List<Map<String, Object>> rewards;
    public MapPosition mapPosition;
    public List<Map<String, Object>> customButtons;
    public String status;
    public String creatorUuid;
    public String createdAt;
    public String updatedAt;

    public static class MapPosition {
        public double x;
        public double y;
    }
}

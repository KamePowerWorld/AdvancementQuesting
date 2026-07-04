package com.kamesuta.advquesting.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.BadRequestResponse;

/**
 * API ルート共通のユーティリティ。
 * ルートクラス間で重複していた処理を集約する。
 */
public final class ApiSupport {

    /** ルート間で共有する ObjectMapper (スレッドセーフ)。 */
    public static final ObjectMapper MAPPER = new ObjectMapper();

    private ApiSupport() {
    }

    /**
     * パスパラメータの ID を int にパースする。
     * 数値でない場合は 400 Bad Request を返す。
     */
    public static int parseId(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            throw new BadRequestResponse("Invalid id");
        }
    }
}

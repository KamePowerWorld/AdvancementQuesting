package com.kamesuta.advquesting.api;

import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.http.Context;
import io.javalin.http.UnauthorizedResponse;

import java.sql.SQLException;

public class AuthMiddleware {

    public static SessionDao.SessionInfo requireAuth(Context ctx, SessionDao sessionDao) throws SQLException {
        String header = ctx.header("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw new UnauthorizedResponse("No token");
        }
        String token = header.substring(7);
        SessionDao.SessionInfo session = sessionDao.findByToken(token);
        if (session == null) throw new UnauthorizedResponse("Invalid or expired token");
        return session;
    }
}

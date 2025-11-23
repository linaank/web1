package org.example;

import com.fastcgi.FCGIInterface;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class Main {

    private static final ThreadLocal<String> EXTRA_HEADERS = ThreadLocal.withInitial(() -> "");
    private static final Map<String, Deque<String>> SESSIONS = new ConcurrentHashMap<>();
    private static final int MAX_ROWS_PER_SESSION = 2000;
    private static final DateTimeFormatter DTF = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public static void main(String[] args) throws IOException {
        FCGIInterface fcgi = new FCGIInterface();

        while (fcgi.FCGIaccept() >= 0) {
            long t0 = System.nanoTime();
            EXTRA_HEADERS.set("");
            try {
                String sid = ensureSession();
                String method = getParam("REQUEST_METHOD", "GET");
                String query = getParam("QUERY_STRING", "");

                // Служебные GET-действия
                if ("GET".equalsIgnoreCase(method)) {
                    Map<String, String> q = parseQuery(query);
                    String action = q.getOrDefault("action", "").toLowerCase(Locale.ROOT);
                    if ("history".equals(action)) {
                        sendHtmlResponse(200, "OK", joinRowsHtml(SESSIONS.get(sid)));
                        continue;
                    }
                    if ("clear".equals(action)) {
                        SESSIONS.remove(sid);
                        sendHtmlResponse(200, "OK", "");
                        continue;
                    }

                    sendHtmlResponse(405, "Method Not Allowed",
                            generateErrorHtml("Ожидался POST-запрос."));
                    continue;
                }

                if (!"POST".equalsIgnoreCase(method)) {
                    sendHtmlResponse(405, "Method Not Allowed",
                            generateErrorHtml("Ожидался POST-запрос."));
                    continue;
                }

                String body = readRequestBody();
                Map<String, String> q = parseQuery(body);

                if (!q.containsKey("x") || !q.containsKey("y") || !q.containsKey("r")) {
                    sendHtmlResponse(400, "Bad Request",
                            generateErrorHtml("Отсутствуют обязательные параметры x, y, r."));
                    continue;
                }

                double x = parseDoubleFromString(q.get("x"), "x");
                double y = parseDoubleFromString(q.get("y"), "y");
                double r = parseDoubleFromString(q.get("r"), "r");

                String err = validateInput(x, y, r);
                if (err != null) {
                    sendHtmlResponse(400, "Bad Request", generateErrorHtml(err));
                    continue;
                }

                boolean hit = calculate(x, y, r);
                long t1 = System.nanoTime();

                String row = generateSuccessHtml(x, y, r, hit, LocalDateTime.now(), (t1 - t0));

                Deque<String> dq = SESSIONS.computeIfAbsent(sid, k -> new ArrayDeque<>());
                dq.addFirst(row);
                while (dq.size() > MAX_ROWS_PER_SESSION) dq.removeLast();

                sendHtmlResponse(200, "OK", row);

            } catch (IllegalArgumentException iae) {
                sendHtmlResponse(400, "Bad Request", generateErrorHtml("Ошибка данных: " + iae.getMessage()));
            } catch (Exception e) {
                e.printStackTrace(System.err);
                sendHtmlResponse(500, "Internal Server Error",
                        generateErrorHtml("Серверная ошибка: " + e.getClass().getSimpleName()));
            } finally {
                EXTRA_HEADERS.remove();
            }
        }
    }


    private static String ensureSession() {
        String cookie = getParam("HTTP_COOKIE", "");
        String sid = null;
        for (String part : cookie.split(";")) {
            String p = part.trim();
            int i = p.indexOf('=');
            if (i > 0) {
                String k = p.substring(0, i).trim();
                String v = p.substring(i + 1).trim();
                if ("SID".equalsIgnoreCase(k)) { sid = v; break; }
            }
        }
        if (sid == null || sid.isBlank()) {
            sid = UUID.randomUUID().toString();
            String setCookie = String.format(
                    "Set-Cookie: SID=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800\r\n", sid);
            EXTRA_HEADERS.set(EXTRA_HEADERS.get() + setCookie);
        }
        return sid;
    }

    private static String getParam(String name, String def) {
        String v = FCGIInterface.request.params.getProperty(name);
        return (v == null || v.isEmpty()) ? def : v;
    }

    private static Map<String, String> parseQuery(String qs) {
        Map<String, String> m = new LinkedHashMap<>();
        if (qs == null || qs.isEmpty()) return m;
        for (String part : qs.split("&")) {
            int i = part.indexOf('=');
            String k = i >= 0 ? part.substring(0, i) : part;
            String v = i >= 0 ? part.substring(i + 1) : "";
            k = URLDecoder.decode(k, StandardCharsets.UTF_8);
            v = URLDecoder.decode(v, StandardCharsets.UTF_8);
            m.put(k, v);
        }
        return m;
    }

    private static String readRequestBody() throws IOException {
        String cl = FCGIInterface.request.params.getProperty("CONTENT_LENGTH");
        int len = 0;
        if (cl != null && !cl.isEmpty()) { try { len = Integer.parseInt(cl); } catch (NumberFormatException ignored) {} }
        if (len <= 0) return "";
        FCGIInterface.request.inStream.fill();
        byte[] buf = new byte[len];
        int off = 0;
        while (off < len) {
            int r = FCGIInterface.request.inStream.read(buf, off, len - off);
            if (r < 0) break; off += r;
        }
        return new String(buf, 0, off, StandardCharsets.UTF_8);
    }

    private static double parseDoubleFromString(String s, String name) {
        try {
            String norm = s.trim().replace(',', '.');
            return Double.parseDouble(norm);
        } catch (Exception e) {
            throw new IllegalArgumentException("Параметр " + name + " должен быть числом.");
        }
    }


    private static boolean calculate(double x, double y, double r) {

        boolean tri = (x>=0) && (y>=0) && (y<= -x + r);
        boolean rect = (x >= 0) && (x <= r/2.0) && (y <= 0) && (y >= -r);
        boolean quarter = (x <= 0) && (y <= 0) && ((x*x + y*y) <= (r*r)/4.0);

        return tri || rect || quarter;
    }

    private static String validateInput(double x, double y, double r) {
    if (y < -3 || y > 3) 
        return "Значение Y должно быть в диапазоне от -3 до 3.";
    if (r < 2 || r > 5) 
        return "Значение R должно быть в диапазоне от 2 до 5.";
    
    return null;
}

    private static void sendHtmlResponse(int statusCode, String statusText, String htmlContent) {
        String extra = EXTRA_HEADERS.get(); if (extra == null) extra = "";
        byte[] bytes = htmlContent.getBytes(StandardCharsets.UTF_8);

        StringBuilder resp = new StringBuilder(256 + htmlContent.length());
        resp.append("Status: ").append(statusCode).append(' ').append(statusText).append("\r\n");
        resp.append("Content-Type: text/html\r\n");
        if (!extra.isEmpty()) resp.append(extra);
        resp.append("Content-Length: ").append(bytes.length).append("\r\n\r\n");
        resp.append(htmlContent);
        System.out.print(resp.toString());
    }

    private static String generateSuccessHtml(double x, double y, double r, boolean isInside,
                                              LocalDateTime now, long execNs) {
        double execMs = execNs / 1_000_000.0;
        return new StringBuilder()
                .append("<tr>")
                .append("<td>").append(x).append("</td>")
                .append("<td>").append(y).append("</td>")
                .append("<td>").append(r).append("</td>")
                .append("<td>").append(isInside ? "Попадание" : "Промах").append("</td>")
                .append("<td>").append(DTF.format(now)).append("</td>")
                .append("<td>").append(String.format(Locale.US, "%.3f ms", execMs)).append("</td>")
                .append("</tr>")
                .toString();
    }

    private static String generateErrorHtml(String msg) {
        return "<tr><td colspan=\"6\" style=\"color:red;\">Ошибка: " + escape(msg) + "</td></tr>";
    }

    private static String joinRowsHtml(Deque<String> rows) {
        if (rows == null || rows.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String r : rows) sb.append(r);
        return sb.toString();
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;");
    }
}

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;

// ================= 代理配置区 =================
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: false
});

// 遗留的静态代理路由（保留以防你需要）
const ROUTE_MAP = {
    '/rrty/': { target: 'https://play.ntcwix.com', referer: 'https://fqzb163.com/' },
    '/live/': { target: 'https://video10.letaocm.top', referer: 'https://688zb24.com/' },
    '/kafei/': { target: 'https://pull.livecdn.cc', referer: 'https://kafeizhibo.com/', strip: true },
    '/qinl/': { target: 'https://qinl-play.agiaexpress.com', referer: 'https://www.hbzb27.com/', strip: true },
    '/ssports/': { target: 'https://hls.zb.ssports.com', referer: 'https://shinaisports.com/' } 
};

// ================= 抓取与加密配置区 =================
const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczpcL1wvYXBpLm9wZW5pbS5jb20iLCJpYXQiOjE3ODAyMjE1MjAsImV4cCI6MTc4MDgyNjMyMCwiZGF0YSI6eyJpZCI6OTgzMDk1LCJ1c2VyaWQiOiJJUWRnV0VSdiIsInVzZXJfaWQiOiJJUWRnV0VSdiIsInVzZXJfbmlja25hbWUiOiJcdTVjMGZcdTc0MDNcdThmZjdJUWRnV0VSdiIsIm1vYmlsZSI6IiIsImNoYXRyb29tX2lkIjoiIiwicG9ydHJhaXQiOiJodHRwczpcL1wvb3BlbmltLWFwaS5jaGZ4ZDhoc3dlb3RlLnh5elwvb2JqZWN0XC9pbUFkbWluXC9pbS1kZWZhdWx0LmpwZyIsImV4cGVyaWVuY2UiOiIwLjAwIiwibmV4dF9leHBlcmllbmNlIjoyMCwiZ3JhZGUiOjEsImZhbnNfbnVtIjozLCJjb2luX251bSI6MCwiZGlhbW9uZF9udW0iOjAsInBheXB3ZCI6MCwiaW1fdWlkIjoiNzE4NDk5MDY3NSIsImVtYWlsIjoiaWt1bkBpa3VuLngxMC5ieiIsInBhc3N3ZF9tZDUiOjEsInVzZXJfbG9naW4iOiIiLCJnZW5kZXIiOjAsImxvZ2luX2FwcCI6MSwicmVnaXN0ZXJfdGltZSI6IjIwMjYtMDUtMTMgMjI6MTk6MDYiLCJmb2xsb3dfbnVtIjowLCJhbmNob3JfYXV0aCI6ImZhbHNlIiwiaGlnaF9hdXRoIjoiZmFsc2UiLCJvcGVyYXRpb25fYXV0aCI6ImZhbHNlIiwiY2hhdF9hdXRoIjoiZmFsc2UiLCJhbGxvd19hZGRfZnJpZW5kIjoxLCJpbV90b2tlbiI6ImV5SmhiR2NpT2lKSVV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUpWYzJWeVNVUWlPaUkzTVRnME9Ua3dOamMxSWl3aVVHeGhkR1p2Y20xSlJDSTZOU3dpWlhod0lqb3hOemswTWpNek9UUTNMQ0p1WW1ZaU9qRTNOemcyT0RFMk5EY3NJbWxoZENJNk1UYzNPRFk0TVRrME4zMC5mQ3U3Y2RTSjZwVlR3OGd2TS1HUkx3WXJFSnBJR2FReFVXZTJRNWVUNldZIiwiY2hhdF90b2tlbiI6ImV5SmhiR2NpT2lKSVV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUpWYzJWeVNVUWlPaUkzTVRnME9Ua3dOamMxSWl3aVZYTmxjbFI1Y0dVaU9qRXNJbEJzWVhSbWIzSnRTVVFpT2pBc0ltVjRjQ0k2T1RJME5URTRNVFV5TUN3aWJtSm1Jam94Tnpnd01qSXhNakl3TENKcFlYUWlPakUzT0RBeU1qRTFNakI5LkoxZVNFN3hHVkM0UEhpTGRzWjNzVVd1SkNLXzhIamEtU1dIdWEtWWlfd3MiLCJoaWdoX2FjY291bnQiOjAsIm9wZXJhdGVfYWNjb3VudCI6MH19.a2XuT3NjBQjnP0N_FyRVZuNEklk_FZg2_t9r-BWVcZE";
const SALT = "yKBm0pKLdVcGbnu4XGon13TsyBdEsjj3WVAzszpoqjn3BNmovLgzvcRTxD1Wey7QQ10kcov0b8e9oBi7jAUR";
const AES_KEY = "j3Qpq3BWs6qUCctm";
const AES_IV = "b2mdEEYbW1qprFsg";

const API_PAGELIST = "https://apc.j8w1d1r1p4g4q6t.cc/v14/live/pagelist?plate_id=11&page_size=36";
const PLAY_API = "https://openim-php-api.x3t9p9f5h0l3.cc/v230/play/url";

const MAX_MATCH_CHANNELS = 47; 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================= 内存数据库 =================
// 替代 Cloudflare D1，直接将抓取的数据存在 Node.js 内存中
let globalRooms = [];

// ================= 工具函数 =================
function generateSignature(params) {
    const sortedKeys = Object.keys(params).sort();
    const paramStr = sortedKeys.map(k => k + params[k]).join("");
    const rawStr = paramStr + SALT;
    return crypto.createHash('md5').update(rawStr).digest('hex');
}

function decryptData(base64Str) {
    try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(AES_KEY), Buffer.from(AES_IV));
        let decrypted = decipher.update(base64Str, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return null;
    }
}

function transformDomain(rawUrl) {
    if (!rawUrl) return null;
    return rawUrl.replace(/https?:\/\/[a-zA-Z0-9-]+\.ntcwix\.com/ig, "https://tv8.gitee.tech");
}

// 动态获取真实流媒体地址
async function fetchRealStreamUrl(roomId, matchId, sportId) {
    const time = Math.floor(Date.now() / 1000).toString();
    const payload = {
        room_id: roomId.toString(),
        code_id: "lgzm", 
        time: time,
        match_id: matchId.toString(),
        sport_id: sportId.toString()
    };
    
    payload.signature = generateSignature(payload);
    const bodyParams = new URLSearchParams(payload).toString();

    try {
        const res = await fetch(PLAY_API, {
            method: "POST",
            headers: {
                "accept": "application/json, text/javascript, */*; q=0.01",
                "api-version": "8",
                "authorization": TOKEN,
                "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                "device": "3",
                "device2": "3",
                "platform": "fqzb",
                "origin": "https://www.fqzb163.com/",
                "referer": "https://www.fqzb163.com/",
                "user-agent": "Mozilla/5.0"
            },
            body: bodyParams
        });

        const encryptedText = (await res.text()).trim().replace(/^"|"$/g, '');
        if (!encryptedText || encryptedText.startsWith("{")) return null;

        const decryptedStr = decryptData(encryptedText);
        if (!decryptedStr) return null;

        let finalUrl = null;
        const urlMatch = decryptedStr.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|flv)[^"'\s]*)/i);
        if (urlMatch) {
            finalUrl = urlMatch[1].replace(/\\\//g, '/');
        } 
        
        if (!finalUrl) {
            try {
                const parsed = JSON.parse(decryptedStr);
                const dataObj = parsed.data || parsed;
                const keys = ['play_url', 'pull_url', 'pull_flv_url', 'url', 'video_url', 'flv', 'm3u8_url', 'hls_url'];
                for (const key of keys) {
                    if (dataObj[key] && typeof dataObj[key] === 'string' && dataObj[key].startsWith('http')) {
                        finalUrl = dataObj[key];
                        break;
                    }
                }
            } catch (jsonErr) {}
        }
        return finalUrl;
    } catch (e) {
        console.error("Fetch stream error:", e.message);
        return null;
    }
}

// 抓取赛事列表并更新到内存数据库
async function updateMemoryDatabase() {
    let validRooms = [];
    const fetchHeaders = { 
        "authorization": TOKEN, 
        "api-version": "8", 
        "platform": "fqzb", 
        "user-agent": "Mozilla/5.0" 
    };

    for (let page = 0; page <= 1; page++) {
        const pageUrl = `${API_PAGELIST}&page=${page}`;
        try {
            const res = await fetch(pageUrl, { headers: fetchHeaders });
            const data = await res.json();

            if (data && data.code === 200 && data.data && Array.isArray(data.data)) {
                for (const room of data.data) {
                    const roomId = room.chatroom_id || room.room_id;
                    const matchId = room.match_id;
                    if (roomId === 888888888 && matchId > 0) {
                        if (!validRooms.find(r => r.matchId === matchId)) {
                            validRooms.push({
                                title: room.room_title || "未知赛事",
                                logo: room.screenshot_url || "",
                                group: "原声(直连无拦截)", 
                                roomId, 
                                matchId, 
                                sportId: room.sport_id || 1
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Page ${page} error:`, e.message);
        }
        if (page === 0) await sleep(800); 
    }

    validRooms = validRooms.slice(0, MAX_MATCH_CHANNELS);
    
    if (validRooms.length > 0) {
        globalRooms = validRooms; // 覆写内存数据
        return { success: true, count: validRooms.length };
    }
    return { success: false, message: "抓取到 0 个有效房间" };
}

// 生成播放列表
function generatePlaylist(host, formatType) {
    if (globalRooms.length === 0) return null;

    let m3uOutput = "#EXTM3U\n";
    let txtOutput = "原声(直连无拦截),#genre#\n";

    for (const room of globalRooms) {
        const fullTitle = `${room.title}-蓝光`;
        // 注意：这里的链接指向我们自己的 Node.js 代理路由
        const proxyUrl = `${host}/lgzm/${room.matchId}?r=${room.roomId}&s=${room.sportId}`;

        txtOutput += `${fullTitle},${proxyUrl}\n`;
        m3uOutput += `#EXTINF:-1 tvg-logo="${room.logo}" group-title="${room.group}",${fullTitle}\n${proxyUrl}\n`;
    }

    return formatType === 'txt' ? txtOutput : m3uOutput;
}

// ================= 核心流媒体代理函数 (解决防盗链和跨域) =================
function proxyStream(targetUrlStr, req, res, corsHeaders, refererOverride) {
    const targetUrl = new URL(targetUrlStr);
    
    const headers = {
        'Referer': refererOverride || 'https://www.fqzb163.com/',
        'Origin': new URL(refererOverride || 'https://www.fqzb163.com/').origin,
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Cookie': req.headers['cookie'] || '', 
        'Connection': 'keep-alive', 
        'Host': targetUrl.host
    };

    if (!headers['Cookie']) delete headers['Cookie'];

    https.get(targetUrlStr, { headers, agent: keepAliveAgent }, (srcRes) => {
        if (srcRes.statusCode >= 300 && srcRes.statusCode < 400) {
            console.warn(`[Redirect Warn] ${targetUrlStr} -> ${srcRes.headers.location}`);
        }

        delete srcRes.headers['access-control-allow-origin'];
        delete srcRes.headers['access-control-allow-methods'];
        delete srcRes.headers['access-control-allow-credentials'];
        delete srcRes.headers['content-length']; // 🚨 保证 chunked 流不被掐断
        
        const responseHeaders = { 
            ...srcRes.headers, 
            ...corsHeaders,
            'Transfer-Encoding': 'chunked',
            'X-Accel-Buffering': 'no',  // 🚨 穿透 Render 平台 Nginx 缓冲
            'Cache-Control': 'no-cache, no-store, must-revalidate', 
            'Pragma': 'no-cache',
            'Expires': '0'
        };

        res.writeHead(srcRes.statusCode, responseHeaders);
        srcRes.pipe(res);
        
    }).on('error', (e) => {
        console.error(`[Proxy Error] ${targetUrlStr} - ${e.message}`);
        if (!res.headersSent) {
            res.writeHead(500, corsHeaders); 
            res.end(`Proxy Error: ${e.message}`);
        }
    });
}

// ================= HTTP 服务器路由分发 =================
const server = http.createServer(async (req, res) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    };

    if (req.method === 'OPTIONS') { 
        res.writeHead(204, corsHeaders);
        return res.end(); 
    }

    const hostPrefix = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    const url = new URL(req.url, hostPrefix);

    try {
        // 1. 触发抓取接口
        if (url.pathname === '/update') {
            const result = await updateMemoryDatabase();
            res.writeHead(result.success ? 200 : 500, { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders });
            return res.end(result.success ? `抓取成功！已将 ${result.count} 个赛事载入内存。` : `抓取失败: ${result.message}`);
        }

        // 2. 播放列表接口
        let formatType = '';
        if (url.pathname === "/playlist.m3u" || url.pathname === "/" || url.pathname === "/m3u") formatType = 'm3u';
        if (url.pathname === "/playlist.txt" || url.pathname === "/txt") formatType = 'txt';

        if (formatType) {
            const playlistData = generatePlaylist(hostPrefix, formatType);
            if (!playlistData) {
                res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders });
                return res.end("当前内存中暂无赛事数据，请先访问 /update 触发抓取。");
            }
            const contentType = formatType === 'txt' ? "text/plain; charset=utf-8" : "application/vnd.apple.mpegurl; charset=utf-8";
            res.writeHead(200, { "Content-Type": contentType, ...corsHeaders });
            return res.end(playlistData);
        }

        // 3. 🔥 核心：动态拦截解密并代理播放流接口 🔥
        if (url.pathname.startsWith("/lgzm/")) {
            const matchId = url.pathname.split("/")[2];
            const roomId = url.searchParams.get("r");
            const sportId = url.searchParams.get("s");

            if (!matchId || !roomId || !sportId) {
                res.writeHead(400, corsHeaders);
                return res.end("Missing parameters");
            }

            // A. 让 Node.js 带着自己的 IP 去请求获取真实的鉴权 URL
            const rawUrl = await fetchRealStreamUrl(roomId, matchId, sportId);
            const targetUrlStr = transformDomain(rawUrl);

            if (!targetUrlStr) {
                res.writeHead(500, corsHeaders);
                return res.end("Failed to fetch upstream encrypted stream URL");
            }

            // B. 拿到 URL 后，绝不重定向，直接在服务端拉取流并透传给前端
            return proxyStream(targetUrlStr, req, res, corsHeaders, 'https://www.fqzb163.com/');
        }

        // 4. 遗留的静态路由代理 (处理 /rrty/ 等等)
        let matched = Object.keys(ROUTE_MAP).find(path => url.pathname.startsWith(path));
        if (matched) { 
            const config = ROUTE_MAP[matched];
            let finalPath = config.strip ? url.pathname.replace(matched, '/') : url.pathname;
            const targetUrlStr = `${config.target}${finalPath}${url.search}`;
            return proxyStream(targetUrlStr, req, res, corsHeaders, config.referer);
        }

        // 404 Not Found
        res.writeHead(404, corsHeaders);
        res.end('Route Not Found');

    } catch (err) {
        console.error("Server Crash Guard:", err);
        res.writeHead(500, corsHeaders);
        res.end("Internal Server Error: " + err.message);
    }
});

server.listen(PORT, () => console.log(`🚀 Unified Proxy Server running on port ${PORT}`));

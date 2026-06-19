const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;

const ROUTE_MAP = {
    '/rrty/': { target: 'https://play.ntcwix.com', referer: 'https://fqzb163.com/' },
    '/live/': { target: 'https://video10.letaocm.top', referer: 'https://688zb24.com/' },
    '/kafei/': { target: 'https://pull.livecdn.cc', referer: 'https://kafeizhibo.com/', strip: true },
    // 👇 已将 target 更新为新的流媒体域名 play.br60g6.com，referer 保持原站点以绕过防盗链
    '/qinl/': { target: 'https://play.br60g6.com', referer: 'https://www.hbzb27.com/', strip: true },
    '/ssports/': { target: 'https://hls.zb.ssports.com', referer: 'https://shinaisports.com/' } 
};

// ==========================================
// 🌟 新增：从 Cloudflare 脚本迁移过来的工具函数
// ==========================================

// 获取特殊序号符号
function getNumberIcon(index) {
    const icons = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    return icons[index - 1] || `(${index})`;
}

// 读取缓存数据（改为兼容 Node.js 环境变量 process.env）
async function getCacheData() {
    const url = process.env.SYS_DB_URL;
    const token = process.env.SYS_DB_TOKEN;
    if (!url || !token) return [];
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(['GET', 'active_matches'])
        });
        const resJson = await response.json();
        return resJson.result ? JSON.parse(resJson.result) : [];
    } catch (e) {
        return [];
    }
}

// 写入缓存数据
async function setCacheData(data) {
    const url = process.env.SYS_DB_URL;
    const token = process.env.SYS_DB_TOKEN;
    if (!url || !token) return;
    
    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(['SET', 'active_matches', JSON.stringify(data)])
        });
    } catch (e) {}
}

// ==========================================
// 原有代理服务的配置与核心逻辑保持不变
// ==========================================
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: false
});

const server = http.createServer((req, res) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    };

    if (req.method === 'OPTIONS') { 
        res.writeHead(204, corsHeaders);
        return res.end(); 
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // ⭐ 新增：拦截 /live.m3u 请求，直接执行 M3U 播放列表生成逻辑
    if (url.pathname === '/live.m3u') {
        handleM3uRequest(req, res, corsHeaders);
        return;
    }

    let matched = Object.keys(ROUTE_MAP).find(path => url.pathname.startsWith(path));

    if (!matched) { 
        res.writeHead(404, corsHeaders);
        return res.end('Route Not Found'); 
    }

    const config = ROUTE_MAP[matched];
    let finalPath = config.strip ? url.pathname.replace(matched, '/') : url.pathname;
    
    if (finalPath.startsWith('//')) finalPath = finalPath.substring(1);
    if (!finalPath.startsWith('/')) finalPath = '/' + finalPath;
    
    const targetUrlStr = `${config.target}${finalPath}${url.search}`;
    const targetUrl = new URL(targetUrlStr);

    const headers = {
        'Referer': config.referer,
        'Origin': new URL(config.referer).origin,
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': req.headers['cookie'] || '', 
        'Connection': 'keep-alive', 
        'Host': targetUrl.host,
        'Accept-Encoding': 'identity'
    };

    if (!headers['Cookie']) delete headers['Cookie'];

    https.get(targetUrlStr, { headers, agent: keepAliveAgent }, (srcRes) => {
        delete srcRes.headers['access-control-allow-origin'];
        delete srcRes.headers['access-control-allow-methods'];
        delete srcRes.headers['access-control-allow-credentials'];
        delete srcRes.headers['content-length'];
        
        const responseHeaders = { 
            ...srcRes.headers, 
            ...corsHeaders,
            'Transfer-Encoding': 'chunked', 
            'X-Accel-Buffering': 'no',      
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
});

// ==========================================
// 🌟 新增：处理 M3U 核心逻辑的异步函数（由原 Worker 迁移转化）
// ==========================================
async function handleM3uRequest(req, res, corsHeaders) {
    if (req.method !== 'GET') {
        res.writeHead(405, corsHeaders);
        return res.end('Method Not Allowed');
    }

    try {
        const nowMs = Date.now();
        const thirtyMinsLaterMs = nowMs + 30 * 60 * 1000;
        const twoHoursMs = 2 * 60 * 60 * 1000;
        const fourHoursAgoMs = nowMs - 4 * 60 * 60 * 1000;

        // 1. 获取缓存的历史数据作为保底
        const historyData = await getCacheData();
        const mergedMap = new Map();
        historyData.forEach(item => mergedMap.set(item.matchId, item));

        // 2. 尝试获取最新数据，带上全套浏览器伪装头
        const targetUrl = 'https://zszb5.com/index.php?g=Wwapi&m=Shanmao&a=eventInfo';
        let freshData = [];
        
        try {
            const apiResponse = await fetch(targetUrl, {
                headers: { 
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,id;q=0.6',
                    'Cache-Control': 'max-age=0',
                    'Priority': 'u=0, i',
                    'Sec-CH-UA': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
                    'Sec-CH-UA-Mobile': '?0',
                    'Sec-CH-UA-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
                }
            });
            
            const textData = await apiResponse.text(); 
            
            if (textData && textData.includes('"data":')) {
                const jsonData = JSON.parse(textData);
                if (jsonData && jsonData.data) {
                    freshData = jsonData.data.map(item => {
                        let timeMs = 0;
                        let shortT = '00:00';
                        if (item.gameTime) {
                            const tStr = item.gameTime.includes('+') || item.gameTime.includes('Z') 
                                ? item.gameTime 
                                : `${item.gameTime}+08:00`;
                            timeMs = new Date(tStr).getTime();
                            shortT = item.gameTime.substring(11, 16);
                        }
                        return { ...item, timeMs, shortT };
                    });
                }
            } else {
                console.error("源站异常 (可能触发防爬/验证码):", textData.substring(0, 100));
            }
        } catch (fetchErr) {
            console.error("抓取源站失败:", fetchErr.message);
        }

        // 3. 合并新老数据
        freshData.forEach(item => {
            const timeElapsed = nowMs - item.timeMs;
            if (timeElapsed >= twoHoursMs && mergedMap.has(item.matchId)) return; 
            mergedMap.set(item.matchId, item);
        });

        // 4. 过滤过期数据并排序
        const finalData = Array.from(mergedMap.values()).filter(item => {
            return item.timeMs >= fourHoursAgoMs && item.timeMs <= thirtyMinsLaterMs;
        }).sort((a, b) => b.timeMs - a.timeMs);

        // 5. 异步更新缓存 (Node.js 直接后台运行，不需要 ctx.waitUntil)
        setCacheData(finalData).catch(err => console.error("更新缓存失败:", err.message));

        // 6. 生成 M3U 播放列表内容
        let content = '#EXTM3U\n';
        
        finalData.forEach(event => {
            const baseTitle = `[${event.shortT}]${event.lname}:${event.hname}_VS_${event.aname}`;
            const logo = event.hicon || ''; 

            let streamCount = 0; 

            const extractStreams = (streamNode) => {
                if (!streamNode || !streamNode.m3u8) return;
                
                const processUrl = (url) => {
                    if (!url) return '';
                    // 💡 注意：此处保留了你原脚本中替换为 'tv8.gitee.tech/qinl' 的逻辑
                    // 如果你想让生成的 m3u 链接直接走你当前这个服务，可以修改为：
                    // return url.replace('play.br60g6.com', `${req.headers.host}/qinl`);
                    return url.replace('play.br60g6.com', 'tv8.gitee.tech/qinl');
                };

                const proxiedUrl = processUrl(streamNode.m3u8);
                streamCount++; 
                const label = getNumberIcon(streamCount); 

                content += `#EXTINF:-1 tvg-logo="${logo}" group-title="清流赛事",${baseTitle}${label}\n`;
                content += `${proxiedUrl}\n`;
            };

            extractStreams(event.stream);
            extractStreams(event.streamAmAli);
            if (event.streamNa && event.streamNa.live) {
                extractStreams(event.streamNa.live);
            }
        });

        res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Content-Disposition': 'inline; filename="live.m3u"'
        });
        res.end(content);
    } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(`Sync Error: ${error.message}`);
    }
}

server.listen(PORT, () => console.log(`🚀 Proxy Server running on http://localhost:${PORT}`));

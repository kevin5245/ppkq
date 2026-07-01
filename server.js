const http = require('http');
const https = require('https');

// 设置服务器端口，默认 8080
const PORT = process.env.PORT || 8080;

// 路由配置表：将本地请求前缀映射到目标流媒体服务器
const ROUTE_MAP = {
    '/rrty/': { target: 'https://play.ntcwix.com', referer: 'https://fqzb163.com/' },
    '/live/': { target: 'https://video10.letaocm.top', referer: 'https://688zb24.com/' },
    '/kafei/': { target: 'https://pull.livecdn.cc', referer: 'https://kafeizhibo.com/', strip: true },
    '/qinl/': { target: 'https://play.br60g6.com', referer: 'https://www.hbzb27.com/', strip: true },
    '/ssports/': { target: 'https://hls.zb.ssports.com', referer: 'https://shinaisports.com/' },
    
    // 👇 熊猫电竞与体育线路系列 (保持原路径，无需 strip)
    '/esport/': { target: 'https://pull.pandascore.vip', referer: 'https://pandascore.live/' },
    '/sport/': { target: 'https://pull.pandascore.vip', referer: 'https://pandascore.live/' },
    '/sp/': { target: 'https://pull.pandascore.vip', referer: 'https://pandascore.live/' },
    
    // 👇 1827线路 (保持原路径 /sla/，无需 strip)
    '/sla/': { target: 'https://tk-hd-liven.fheuuw.com', referer: 'https://www.1827.com/' },

    // 👇 sb 线路 (新增，使用 /sb/ 前缀避免与上面 pandascore 的 /sport/ 冲突)
    '/sb/': { target: 'https://voide.sb-live.org', referer: 'https://sb9275.net/', strip: true }
};

// 保持 HTTP 长连接，提升拉取 M3U8 切片时的稳定性和速度
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: false // 忽略目标服务器可能存在的自签名证书问题
});

const server = http.createServer((req, res) => {
    // 统一的跨域 (CORS) 配置，允许任何播放器访问
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    };

    // 1. 处理预检请求 (CORS OPTIONS)
    if (req.method === 'OPTIONS') { 
        res.writeHead(204, corsHeaders);
        return res.end(); 
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // 2. 匹配路由规则
    let matched = Object.keys(ROUTE_MAP).find(path => url.pathname.startsWith(path));

    if (!matched) { 
        res.writeHead(404, corsHeaders);
        return res.end('Route Not Found'); 
    }

    const config = ROUTE_MAP[matched];
    
    // 3. 路径转换逻辑：如果开启了 strip，则切掉前缀；否则保留完整路径
    let finalPath = config.strip ? url.pathname.replace(matched, '/') : url.pathname;
    
    // 自动处理替换后的路径合并问题，防止出现双斜杠或少斜杠
    if (finalPath.startsWith('//')) finalPath = finalPath.substring(1);
    if (!finalPath.startsWith('/')) finalPath = '/' + finalPath;
    
    // 拼接最终的目标 URL (包含查询参数，如 auth_key 等防盗链签名)
    const targetUrlStr = `${config.target}${finalPath}${url.search}`;
    const targetUrl = new URL(targetUrlStr);

    // 4. 伪造请求头，欺骗上游服务器的防盗链验证
    const headers = {
        'Referer': config.referer,
        'Origin': new URL(config.referer).origin,
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': req.headers['cookie'] || '', 
        'Connection': 'keep-alive', 
        'Host': targetUrl.host,
        // 🚨 核心修复：强制禁止上游 CDN 使用 GZIP 压缩，防止 M3U8 解析错误导致断流
        'Accept-Encoding': 'identity'
    };

    if (!headers['Cookie']) delete headers['Cookie'];

    // 5. 发起代理请求到真实的流媒体服务器
    https.get(targetUrlStr, { headers, agent: keepAliveAgent }, (srcRes) => {
        
        // 删除源服务器自身的 CORS 头，避免与我们代理层的 corsHeaders 冲突
        delete srcRes.headers['access-control-allow-origin'];
        delete srcRes.headers['access-control-allow-methods'];
        delete srcRes.headers['access-control-allow-credentials'];

        // 🚨 核心修复：必须删除 content-length，防止播放器误判流已结束 (解决播几秒就卡住的问题)
        delete srcRes.headers['content-length'];
        
        // 组装最终返回给本地播放器的 Header
        const responseHeaders = { 
            ...srcRes.headers, 
            ...corsHeaders,
            'Transfer-Encoding': 'chunked', // 强制分块传输，适合直播流
            'X-Accel-Buffering': 'no',      // 穿透 Nginx 等反代服务器的缓存，降低延迟
            'Cache-Control': 'no-cache, no-store, must-revalidate', 
            'Pragma': 'no-cache',
            'Expires': '0'
        };

        // 将状态码和处理后的请求头发送给播放器
        res.writeHead(srcRes.statusCode, responseHeaders);
        
        // 将视频流数据直接以管道 (pipe) 形式透传给播放器
        srcRes.pipe(res);
        
    }).on('error', (e) => {
        console.error(`[Proxy Error] ${targetUrlStr} - ${e.message}`);
        if (!res.headersSent) {
            res.writeHead(500, corsHeaders); 
            res.end(`Proxy Error: ${e.message}`);
        }
    });
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Proxy Server running on http://localhost:${PORT}`);
    console.log(`=========================================`);
    console.log(`已加载的路由规则:`);
    Object.keys(ROUTE_MAP).forEach(route => {
        console.log(`  🔗 ${route.padEnd(10)} ->  ${ROUTE_MAP[route].target}`);
    });
    console.log(`=========================================\n`);
});

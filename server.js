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
    
    // 熊猫电竞与体育线路系列 (保持原路径，无需 strip)
    '/esport/': { target: 'https://pull.pandascore.vip', referer: 'https://pandascore.live/' },
    '/sport/': { target: 'https://pull.pandascore.vip', referer: 'https://pandascore.live/' },
    '/sp/': { target: 'https://pull.pandascore.vip', referer: 'https://pandascore.live/' },
    
    // 1827线路 (保持原路径 /sla/，无需 strip)
    '/sla/': { target: 'https://tk-hd-liven.fheuuw.com', referer: 'https://www.1827.com/' },

    // sb 线路
    '/sb/': { target: 'https://voide.sb-live.org', referer: 'https://sb9275.net/', strip: true },

    // vivo 线路
    '/vivo/': { target: 'https://live.vivo200.com', referer: 'https://player.online909.com/', strip: true },

    // 新增的 b-cdn 线路
    '/bcdn/': { target: 'https://llivewithhy.b-cdn.net', referer: 'https://1b6gazd2.tukartukar88.xyz/', strip: true }
};

// 保持 HTTP 长连接，提升拉取切片时的稳定性和速度
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
        // 强制禁止上游 CDN 使用 GZIP 压缩，防止视频流解析错误
        'Accept-Encoding': 'identity'
    };

    if (!headers['Cookie']) delete headers['Cookie'];

    // 5. 发起代理请求到真实的流媒体服务器
    // ⚠️ 修复点：将请求赋值给 proxyReq，以便在客户端断开时销毁它
    const proxyReq = https.get(targetUrlStr, { headers, agent: keepAliveAgent }, (srcRes) => {
        
        // 删除源服务器自身的 CORS 头，避免冲突
        delete srcRes.headers['access-control-allow-origin'];
        delete srcRes.headers['access-control-allow-methods'];
        delete srcRes.headers['access-control-allow-credentials'];

        // 🚨 502 核心修复1：同时删除 Content-Length 和 Transfer-Encoding，防止向 Cloudflare/Render 发送重复或矛盾的流传输协议
        delete srcRes.headers['content-length'];
        delete srcRes.headers['transfer-encoding'];
        
        // 组装最终返回给本地播放器的 Header
        const responseHeaders = { 
            ...srcRes.headers, 
            ...corsHeaders,
            'Transfer-Encoding': 'chunked', // 代理层重新强制声明分块传输
            'X-Accel-Buffering': 'no',      // 穿透缓存，降低直播延迟
            'Cache-Control': 'no-cache, no-store, must-revalidate', 
            'Pragma': 'no-cache',
            'Expires': '0'
        };

        // 将状态码和处理后的请求头发送给播放器
        res.writeHead(srcRes.statusCode, responseHeaders);
        
        // 将视频流数据透传给播放器
        srcRes.pipe(res);
        
        // 🚨 502 核心修复2：当浏览器或播放器停止播放（断开连接）时，必须销毁上游的视频流！
        // 否则持续下载的数据会撑爆内存，导致 Render 重启你的应用，对外抛出 502 错误。
        req.on('close', () => {
            srcRes.destroy();
        });

    }).on('error', (e) => {
        console.error(`[Proxy Error] ${targetUrlStr} - ${e.message}`);
        if (!res.headersSent) {
            res.writeHead(500, corsHeaders); 
            res.end(`Proxy Error: ${e.message}`);
        }
    });

    // 🚨 502 核心修复3：如果客户端在成功连接上游前就刷新了页面，直接终止代理请求
    req.on('close', () => {
        if (proxyReq && !proxyReq.destroyed) {
            proxyReq.destroy();
        }
    });
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`\n=========================================`);
    if (process.env.RENDER_EXTERNAL_URL) {
        console.log(`🚀 Proxy Server running on ${process.env.RENDER_EXTERNAL_URL}`);
    } else {
        console.log(`🚀 Proxy Server running on http://localhost:${PORT}`);
    }
    console.log(`=========================================`);
    console.log(`已加载的路由规则:`);
    Object.keys(ROUTE_MAP).forEach(route => {
        console.log(`  🔗 ${route.padEnd(10)} ->  ${ROUTE_MAP[route].target}`);
    });
    console.log(`=========================================\n`);
});

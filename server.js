const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;

const ROUTE_MAP = {
    '/rrty/': { target: 'https://play.ntcwix.com', referer: 'https://fqzb163.com/' },
    '/live/': { target: 'https://video10.letaocm.top', referer: 'https://688zb24.com/' },
    '/kafei/': { target: 'https://pull.livecdn.cc', referer: 'https://kafeizhibo.com/', strip: true },
    '/qinl/': { target: 'https://qinl-play.agiaexpress.com', referer: 'https://www.hbzb27.com/', strip: true },
    '/ssports/': { target: 'https://hls.zb.ssports.com', referer: 'https://shinaisports.com/' } 
};

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
    let matched = Object.keys(ROUTE_MAP).find(path => url.pathname.startsWith(path));

    if (!matched) { 
        res.writeHead(404, corsHeaders);
        return res.end('Route Not Found'); 
    }

    const config = ROUTE_MAP[matched];
    let finalPath = config.strip ? url.pathname.replace(matched, '/') : url.pathname;
    const targetUrlStr = `${config.target}${finalPath}${url.search}`;
    const targetUrl = new URL(targetUrlStr);

    const headers = {
        'Referer': config.referer,
        'Origin': new URL(config.referer).origin,
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': req.headers['cookie'] || '', 
        'Connection': 'keep-alive', 
        'Host': targetUrl.host,
        // 🚨 核心修复：强制禁止上游 CDN 使用 GZIP 压缩，防止数据包解析错误导致 3 秒断流
        'Accept-Encoding': 'identity'
    };

    if (!headers['Cookie']) delete headers['Cookie'];

    https.get(targetUrlStr, { headers, agent: keepAliveAgent }, (srcRes) => {
        
        delete srcRes.headers['access-control-allow-origin'];
        delete srcRes.headers['access-control-allow-methods'];
        delete srcRes.headers['access-control-allow-credentials'];

        // 🚨 核心修复：必须删除 content-length，防止播放器误判流已结束
        delete srcRes.headers['content-length'];
        
        const responseHeaders = { 
            ...srcRes.headers, 
            ...corsHeaders,
            'Transfer-Encoding': 'chunked', // 强制分块传输
            'X-Accel-Buffering': 'no',      // 穿透 Render/Nginx 缓存
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

server.listen(PORT, () => console.log(`🚀 Proxy Server running on http://localhost:${PORT}`));

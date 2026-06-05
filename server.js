const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;

const ROUTE_MAP = {
    '/rrty/': { target: 'https://play.ntcwix.com', referer: 'https://fqzb163.com/' },
    '/live/': { target: 'https://video10.letaocm.top', referer: 'https://688zb24.com/' },
    '/kafei/': { target: 'https://pull.livecdn.cc', referer: 'https://kafeizhibo.com/', strip: true },
    '/qinl/': { target: 'https://qinl-play.agiaexpress.com', referer: 'https://www.hbzb27.com/', strip: true },
    // 新增的代理路由
    '/ssports/': { target: 'https://hls.zb.ssports.com', referer: 'https://shinaisports.com/' } 
};

const server = http.createServer((req, res) => {
    // 1. 统一设置我们自己的 CORS 头
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    };

    // 处理预检请求
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
    let finalPath = url.pathname;
    
    // 如果开启 strip，将匹配到的前缀替换为 '/'
    if (config.strip) {
        finalPath = url.pathname.replace(matched, '/');
    }

    const targetUrl = `${config.target}${finalPath}${url.search}`;

    // 2. 伪装请求头，欺骗目标服务器
    const headers = {
        'Referer': config.referer,
        'Origin': new URL(config.referer).origin,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    };

    // 3. 发起代理请求
    https.get(targetUrl, { headers }, (srcRes) => {
        // 🚨 关键修复：删除目标服务器自带的 CORS 相关头，防止冲突覆盖
        delete srcRes.headers['access-control-allow-origin'];
        delete srcRes.headers['access-control-allow-methods'];
        delete srcRes.headers['access-control-allow-credentials'];

        // 合并我们自己设置的 CORS 头
        const responseHeaders = { ...srcRes.headers, ...corsHeaders };

        res.writeHead(srcRes.statusCode, responseHeaders);
        
        // 使用 pipe 高效传输流媒体
        srcRes.pipe(res);
        
    }).on('error', (e) => {
        console.error(`[Proxy Error] ${targetUrl} - ${e.message}`);
        res.writeHead(500, corsHeaders); 
        res.end(`Proxy Error: ${e.message}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Proxy Server running on http://localhost:${PORT}`));

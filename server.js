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

// 🚨 关键修复 1：创建一个支持长连接的 HTTPS Agent，对 HTTP-FLV 维持流态至关重要
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: false // 忽略部分目标服务器的 SSL 证书验证问题，防止握手失败
});

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
    const targetHost = new URL(targetUrl).host;

    // 2. 伪装请求头，欺骗目标服务器
    const headers = {
        'Referer': config.referer,
        'Origin': new URL(config.referer).origin,
        // 尽量透传真实浏览器的 User-Agent
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        
        // 🚨 关键修复 2：透传 Cookie（部分防盗链基于会话）
        'Cookie': req.headers['cookie'] || '', 
        
        // 🚨 关键修复 3：强制向上游服务器请求长连接
        'Connection': 'keep-alive', 
        
        // 🚨 关键修复 4：重写 Host，防止带着本地 localhost 的 Host 去请求 CDN，否则会被秒踢
        'Host': targetHost
    };

    // 清理空 Cookie，防止请求头格式异常
    if (!headers['Cookie']) delete headers['Cookie'];

    // 3. 发起代理请求
    https.get(targetUrl, { headers, agent: keepAliveAgent }, (srcRes) => {
        
        // 监控是否触发了防盗链的 302 重定向（通常被拦截会跳到错误页）
        if (srcRes.statusCode >= 300 && srcRes.statusCode < 400) {
            console.warn(`[Redirect/Block Warn] ${targetUrl} -> ${srcRes.headers.location}`);
        }

        // 删除目标服务器自带的 CORS 相关头，防止冲突覆盖
        delete srcRes.headers['access-control-allow-origin'];
        delete srcRes.headers['access-control-allow-methods'];
        delete srcRes.headers['access-control-allow-credentials'];

        // 🚨 关键修复 5：处理 HTTP-FLV 的分块传输问题
        // 干掉源站可能的 Content-Length，防止播放器把它当成定长文件而终止
        delete srcRes.headers['content-length'];
        
        // 合并我们自己设置的 CORS 头，并显式声明为分块传输的无限流
        const responseHeaders = { 
            ...srcRes.headers, 
            ...corsHeaders,
            'Transfer-Encoding': 'chunked' 
        };

        res.writeHead(srcRes.statusCode, responseHeaders);
        
        // 使用 pipe 高效传输流媒体
        srcRes.pipe(res);
        
    }).on('error', (e) => {
        console.error(`[Proxy Error] ${targetUrl} - ${e.message}`);
        // 🚨 关键修复 6：防止由于网络波动导致重复响应，从而引发 Node.js 奔溃
        if (!res.headersSent) {
            res.writeHead(500, corsHeaders); 
            res.end(`Proxy Error: ${e.message}`);
        }
    });
});

server.listen(PORT, () => console.log(`🚀 Proxy Server running on http://localhost:${PORT}`));

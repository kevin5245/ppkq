const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;

const ROUTE_MAP = {
    '/rrty/': { target: 'https://play.gpycvac.com', referer: 'https://fqzb7.com/' },
    '/live/': { target: 'https://video10.letaocm.top', referer: 'https://688zb24.com/' },
    '/kafei/': { target: 'https://pull.livecdn.cc', referer: 'https://kafeizhibo.com/', strip: true },
    '/qinl/': { target: 'https://qinl-play.agiaexpress.com', referer: 'https://www.hbzb27.com/', strip: true }
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

    // =====================================================================
    // 【新增】路由：专门处理 M3U8 内部的 TS 切片代理 (防源站直接暴露)
    // =====================================================================
    if (url.pathname === '/ts_proxy') {
        const actualTsUrl = url.searchParams.get('url');
        if (!actualTsUrl) {
            res.writeHead(400, corsHeaders);
            return res.end('Missing TS URL');
        }

        // 动态判断是 http 还是 https
        const requestClient = actualTsUrl.startsWith('https') ? https : http;
        
        requestClient.get(actualTsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (tsRes) => {
            delete tsRes.headers['access-control-allow-origin'];
            const tsHeaders = { ...tsRes.headers, ...corsHeaders };
            res.writeHead(tsRes.statusCode, tsHeaders);
            tsRes.pipe(res);
        }).on('error', (e) => {
            res.writeHead(500, corsHeaders);
            res.end(`TS Proxy Error: ${e.message}`);
        });
        return;
    }
    // =====================================================================

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

        const responseHeaders = { ...srcRes.headers, ...corsHeaders };
        const contentType = responseHeaders['content-type'] || '';

        // =====================================================================
        // 【新增】M3U8 文本重写逻辑
        // =====================================================================
        if (url.pathname.endsWith('.m3u8') || contentType.includes('mpegurl')) {
            let body = '';
            srcRes.on('data', chunk => body += chunk);
            srcRes.on('end', () => {
                const rewrittenText = body.split('\n').map(line => {
                    line = line.trim();
                    if (!line || (line.startsWith('#') && !line.includes('URI='))) return line;

                    // 重写嵌套的 m3u8 或加密 key 的 URI
                    if (line.includes('URI="')) {
                        return line.replace(/URI="([^"]+)"/, (match, p1) => {
                            const absoluteUri = new URL(p1, targetUrl).href;
                            return `URI="${url.origin}/ts_proxy?url=${encodeURIComponent(absoluteUri)}"`;
                        });
                    }

                    // 重写 TS 切片链接
                    const absoluteTsUrl = new URL(line, targetUrl).href;
                    return `${url.origin}/ts_proxy?url=${encodeURIComponent(absoluteTsUrl)}`;
                }).join('\n');

                // 因为重写了文本，原有的 Content-Length 已经失效，必须删除
                delete responseHeaders['content-length'];
                responseHeaders['content-type'] = 'application/vnd.apple.mpegurl; charset=utf-8';
                
                res.writeHead(srcRes.statusCode, responseHeaders);
                res.end(rewrittenText);
            });
        } else {
            // 场景 2：不是 m3u8（例如 FLV 或直接的 TS 文件），老老实实直接透传
            res.writeHead(srcRes.statusCode, responseHeaders);
            srcRes.pipe(res);
        }
        // =====================================================================
        
    }).on('error', (e) => {
        console.error(`[Proxy Error] ${targetUrl} - ${e.message}`);
        res.writeHead(500, corsHeaders); 
        res.end(`Proxy Error: ${e.message}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Proxy Server running on http://localhost:${PORT}`));

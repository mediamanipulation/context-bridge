import * as https from 'https';
import { URL } from 'url';

export function postJson(endpoint: string, data: any): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(endpoint);
      const payload = JSON.stringify(data);
      const opts: any = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(opts, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) { resolve(); }
          else { reject(new Error('Status ' + res.statusCode + ' body: ' + body)); }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(payload);
      req.end();
    } catch (err) { reject(err); }
  });
}

#!/usr/bin/env python3
"""Local preview of the no-About pack. Proxies assets to the live site. Does not write to production."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote
import ssl, urllib.request

PAGES = Path('/workspace/noabout-preview/pages')
MAP = {
    '/': 'home.html',
    '/media': 'media.html',
    '/creators': 'creators.html',
    '/sponsorships': 'sponsorships.html',
    '/legal': 'legal.html',
    '/brands': 'brands.html',
    '/services': 'services.html',
    '/contact': 'contact.html',
    '/credits': 'credits.html',
    '/thanks': 'thanks.html',
}
TIER = {
    'founding partner': 'sponsorships-founding-partner.html',
    'founding-partner': 'sponsorships-founding-partner.html',
    'inner circle': 'sponsorships-inner-circle.html',
    'inner-circle': 'sponsorships-inner-circle.html',
    'stakeholder': 'sponsorships-stakeholder.html',
}
CONTACT = {
    'creator': 'contact-creator.html',
    'event': 'contact-event.html',
}
CTX = ssl.create_default_context()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def do_HEAD(self):
        self.do_GET()
    def do_GET(self):
        u = urlparse(self.path)
        p = unquote(u.path)
        if len(p) > 1 and p.endswith('/'):
            p = p[:-1]
        if p in ('/about', '/about.html') or self.path.startswith('/about'):
            self.send_response(301)
            self.send_header('Location', '/')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return
        q = u.query
        name = None
        if p == '/contact':
            typ = ''
            for part in q.split('&'):
                if part.startswith('type='):
                    typ = unquote(part.split('=',1)[1])
            name = CONTACT.get(typ, 'contact.html')
        elif p == '/sponsorships':
            tier = ''
            for part in q.split('&'):
                if part.startswith('tier='):
                    tier = unquote(part.split('=',1)[1])
            name = TIER.get(tier.lower(), 'sponsorships.html') if tier else 'sponsorships.html'
        elif p in MAP:
            name = MAP[p]
        if name:
            body = (PAGES/name).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        # 404 page for unknown HTML-like paths without a file extension
        if '.' not in p.rsplit('/',1)[-1]:
            body = (PAGES/'404.html').read_bytes()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)
            return
        # proxy static assets from live
        req = urllib.request.Request('https://sbridgemedia.com'+self.path, headers={'User-Agent':'SouthBridgePreview/1.0'})
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=20) as r:
                data = r.read()
                self.send_response(r.status)
                ct = r.headers.get('Content-Type', 'application/octet-stream')
                self.send_header('Content-Type', ct)
                self.send_header('Cache-Control', 'public, max-age=3600')
                self.end_headers()
                self.wfile.write(data)
        except Exception:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv)>1 else 8798
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()

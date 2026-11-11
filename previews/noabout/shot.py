#!/usr/bin/env python3
"""CDP screenshots of live (before) and local preview (after)."""
import json, os, socket, hashlib, base64, struct, time, urllib.request, subprocess, sys, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path('/workspace/noabout-preview/screenshots')
OUT.mkdir(parents=True, exist_ok=True)
CHROME = '/usr/bin/google-chrome'
PORT = 9334
PROFILE = '/tmp/chrome-noabout-cdp'
LIVE = 'https://sbridgemedia.com'
PREV = 'http://127.0.0.1:8798'

class WS:
    def __init__(self, url):
        assert url.startswith('ws://')
        rest = url[5:]
        hostpath = rest
        host, path = hostpath.split('/', 1)
        path = '/' + path
        if ':' in host:
            hostname, port = host.rsplit(':', 1)
            port = int(port)
        else:
            hostname, port = host, 80
        key = base64.b64encode(os.urandom(16)).decode()
        s = socket.create_connection((hostname, port), timeout=30)
        req = (
            f'GET {path} HTTP/1.1\r\n'
            f'Host: {host}\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\n'
            'Sec-WebSocket-Version: 13\r\n\r\n'
        )
        s.sendall(req.encode())
        data = b''
        while b'\r\n\r\n' not in data:
            chunk = s.recv(4096)
            if not chunk:
                raise RuntimeError('WS handshake failed')
            data += chunk
        self.s = s
        self._id = 0
        self.buf = b''

    def _frame(self, payload):
        p = payload if isinstance(payload, bytes) else payload.encode()
        header = bytearray()
        header.append(0x81)
        n = len(p)
        mask = os.urandom(4)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack('!H', n)
        else:
            header.append(0x80 | 127)
            header += struct.pack('!Q', n)
        header += mask
        body = bytearray(p)
        for i in range(n):
            body[i] ^= mask[i % 4]
        return bytes(header) + bytes(body)

    def _recv_raw(self):
        def recvn(n):
            while len(self.buf) < n:
                chunk = self.s.recv(65536)
                if not chunk:
                    raise RuntimeError('WS closed')
                self.buf += chunk
            out, self.buf = self.buf[:n], self.buf[n:]
            return out
        b1, b2 = recvn(2)
        opcode = b1 & 0x0F
        ln = b2 & 0x7F
        if ln == 126:
            ln = struct.unpack('!H', recvn(2))[0]
        elif ln == 127:
            ln = struct.unpack('!Q', recvn(8))[0]
        if b2 & 0x80:
            mask = recvn(4)
            payload = bytearray(recvn(ln))
            for i in range(ln):
                payload[i] ^= mask[i % 4]
            payload = bytes(payload)
        else:
            payload = recvn(ln)
        if opcode == 0x8:
            raise RuntimeError('WS close')
        if opcode == 0x9:  # ping
            self.s.sendall(self._frame(payload).replace(b'\x81', b'\x8a', 1) if False else self._pong(payload))
            return self._recv_raw()
        return payload

    def _pong(self, payload):
        # unmasked? we always mask
        return self._frame(payload)  # opcode still 0x81; close enough for chrome
        # actually rewrite opcode to 0x8A
        # handled below unused

    def send(self, method, params=None, timeout=30):
        self._id += 1
        mid = self._id
        msg = {'id': mid, 'method': method}
        if params:
            msg['params'] = params
        self.s.sendall(self._frame(json.dumps(msg)))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = self._recv_raw()
            try:
                obj = json.loads(raw)
            except Exception:
                continue
            if obj.get('id') == mid:
                if 'error' in obj:
                    raise RuntimeError(f'{method}: {obj["error"]}')
                return obj.get('result', {})
        raise TimeoutError(method)

    def close(self):
        try:
            self.s.close()
        except Exception:
            pass


def start_chrome():
    shutil.rmtree(PROFILE, ignore_errors=True)
    Path(PROFILE).mkdir(parents=True, exist_ok=True)
    cmd = [
        CHROME, '--headless=new', '--disable-gpu', '--no-sandbox',
        '--hide-scrollbars', '--disable-dev-shm-usage',
        f'--remote-debugging-port={PORT}',
        f'--user-data-dir={PROFILE}',
        '--remote-allow-origins=*',
        'about:blank',
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
            return proc
        except Exception:
            time.sleep(0.15)
    raise RuntimeError('chrome did not start')


def new_page():
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}/json/new?about:blank', method='PUT')
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=5).read())
    except Exception:
        data = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/new?about:blank', timeout=5).read())
    return data['webSocketDebuggerUrl']


def connect():
    wsurl = new_page()
    ws = WS(wsurl)
    ws.send('Page.enable')
    ws.send('Runtime.enable')
    ws.send('Network.enable')
    return ws


def set_viewport(ws, w, h, mobile=False):
    ws.send('Emulation.setDeviceMetricsOverride', {
        'width': w, 'height': h, 'deviceScaleFactor': 2, 'mobile': mobile,
    })
    ws.send('Emulation.setTouchEmulationEnabled', {'enabled': mobile})


def navigate(ws, url):
    ws.send('Page.navigate', {'url': url})
    # wait for load
    deadline = time.time() + 25
    # also poll readyState
    time.sleep(0.3)
    while time.time() < deadline:
        res = ws.send('Runtime.evaluate', {'expression': 'document.readyState', 'returnByValue': True})
        if res.get('result', {}).get('value') == 'complete':
            break
        time.sleep(0.15)
    # wait fonts/images a bit
    ws.send('Runtime.evaluate', {
        'expression': 'document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>true) : true',
        'awaitPromise': True,
        'returnByValue': True,
    }, timeout=15)
    time.sleep(0.6)


def evaljs(ws, expr, await_promise=False):
    res = ws.send('Runtime.evaluate', {
        'expression': expr,
        'awaitPromise': await_promise,
        'returnByValue': True,
    })
    return res.get('result', {}).get('value')


def shot(ws, path, clip=None):
    params = {'format': 'png', 'fromSurface': True, 'captureBeyondViewport': True}
    if clip:
        params['clip'] = {**clip, 'scale': 1}
    res = ws.send('Page.captureScreenshot', params, timeout=20)
    Path(path).write_bytes(base64.b64decode(res['data']))
    print('wrote', path, Path(path).stat().st_size)


def rect(ws, selector):
    return evaljs(ws, f"""(() => {{
      const el = document.querySelector({json.dumps(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {{
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
        vy: r.y,
        scrollY: window.scrollY
      }};
    }})()""")


def shot_el(ws, selector, path, pad=8):
    r = rect(ws, selector)
    if not r or r['width'] < 2 or r['height'] < 2:
        raise RuntimeError(f'no element {selector}')
    clip = {
        'x': max(0, r['x'] - pad),
        'y': max(0, r['y'] - pad),
        'width': r['width'] + pad * 2,
        'height': r['height'] + pad * 2,
    }
    shot(ws, path, clip)


def prepare_page(ws):
    evaljs(ws, """(() => {
      document.documentElement.classList.add('no-js');
      document.documentElement.style.scrollBehavior='auto';
      document.body.style.scrollBehavior='auto';
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
      document.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
      const style = document.createElement('style');
      style.textContent = '.reveal,.ba-reveal{opacity:1!important;transform:none!important;filter:none!important}';
      document.head.appendChild(style);
      return true;
    })()""")
    evaljs(ws, """(() => Promise.all([...document.images].map(img => {
      if (img.complete) return true;
      return new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 8000); });
    })).then(() => true))""", await_promise=True)
    time.sleep(0.4)

def shot_in_view(ws, selector, path, pad=12, vw=1440, vh=900):
    evaljs(ws, f"""(() => {{
      const el = document.querySelector({json.dumps(selector)});
      if (!el) return false;
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo(0, Math.max(0, top));
      return window.scrollY;
    }})()""")
    time.sleep(0.4)
    evaljs(ws, f"""(() => {{
      const root = document.querySelector({json.dumps(selector)});
      if (!root) return true;
      return Promise.all([...root.querySelectorAll('img')].map(img => {{
        img.loading = 'eager';
        if (img.complete && img.naturalWidth) return true;
        return new Promise(r => {{ img.onload = img.onerror = r; setTimeout(r, 8000); }});
      }})).then(() => true);
    }})()""", await_promise=True)
    time.sleep(0.3)
    r = rect(ws, selector)
    if not r:
        raise RuntimeError('missing ' + selector)
    if r['height'] > vh - 40 or r['y'] < 0 or (r['y'] + min(r['height'], vh)) > vh:
        evaljs(ws, f"""(() => {{
          const el = document.querySelector({json.dumps(selector)});
          el.scrollIntoView({{block:"start", inline:"nearest"}});
          window.scrollBy(0, -16);
          return true;
        }})()""")
        time.sleep(0.35)
        r = rect(ws, selector)
    clip = {
        'x': max(0, r['x'] - pad),
        'y': max(0, r['y'] - pad),
        'width': min(vw, r['width'] + pad * 2),
        'height': min(vh - 10, max(40, r['height'] + pad * 2)),
    }
    print('  clip', selector, clip, 'rect', r)
    shot(ws, path, clip)

def capture_set(label, base):
    ws = connect()
    try:
        set_viewport(ws, 1440, 900, mobile=False)
        navigate(ws, base + '/')
        prepare_page(ws)
        shot_el(ws, 'header', OUT / f'{label}-home-header.png', pad=0)
        shot_in_view(ws, '.footer-cols', OUT / f'{label}-home-footer-cols.png', pad=16)
        evaljs(ws, """(() => {
          const h = [...document.querySelectorAll('footer h4')].find(e => e.textContent.trim() === 'Company');
          if (h) { h.parentElement.setAttribute('data-shot-company','1'); return 'ok'; }
          return 'missing';
        })()""")
        shot_in_view(ws, '[data-shot-company]', OUT / f'{label}-home-footer-company.png', pad=16)
        shot_in_view(ws, '#web-examples .featured-head', OUT / f'{label}-home-featured-head.png', pad=12)
        shot_in_view(ws, '#tango-two-one-compare', OUT / f'{label}-home-featured-tango.png', pad=16)
        shot_in_view(ws, '#neurons-away-compare', OUT / f'{label}-home-featured-neurons.png', pad=16)
        evaljs(ws, """(() => {
          [...document.querySelectorAll('#web-examples article.listing')].forEach((el,i) => el.setAttribute('data-shot-listing', String(i)));
          return document.querySelectorAll('#web-examples article.listing').length;
        })()""")
        shot_in_view(ws, '[data-shot-listing="0"] .listing-info', OUT / f'{label}-home-listing-tango-info.png', pad=12)
        shot_in_view(ws, '[data-shot-listing="1"] .listing-info', OUT / f'{label}-home-listing-neurons-info.png', pad=12)

        navigate(ws, base + '/media')
        prepare_page(ws)
        shot_in_view(ws, '#tango-two-one-compare', OUT / f'{label}-media-featured-tango.png', pad=16)
        shot_in_view(ws, '#neurons-away-compare', OUT / f'{label}-media-featured-neurons.png', pad=16)
        evaljs(ws, """(() => {
          [...document.querySelectorAll('#web-examples article.listing')].forEach((el,i) => el.setAttribute('data-shot-listing', String(i)));
          return true;
        })()""")
        shot_in_view(ws, '[data-shot-listing="0"] .listing-info', OUT / f'{label}-media-listing-tango-info.png', pad=12)
        shot_in_view(ws, '[data-shot-listing="1"] .listing-info', OUT / f'{label}-media-listing-neurons-info.png', pad=12)
    finally:
        ws.close()

    ws = connect()
    try:
        set_viewport(ws, 390, 844, mobile=True)
        navigate(ws, base + '/')
        prepare_page(ws)
        evaljs(ws, """(() => {
          const btn = document.querySelector('[data-menu-toggle], .menu-toggle');
          if (btn) btn.click();
          return !!btn;
        })()""")
        time.sleep(0.5)
        shot(ws, OUT / f'{label}-home-mobile-menu.png')
    finally:
        ws.close()


def main():
    proc = start_chrome()
    try:
        capture_set('before', LIVE)
        capture_set('after', PREV)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    print('done', list(sorted(p.name for p in OUT.glob('*.png'))))

if __name__ == '__main__':
    main()

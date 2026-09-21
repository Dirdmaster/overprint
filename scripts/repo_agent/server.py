"""Small loopback-only webhook listener. TLS belongs to the reverse proxy."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading


class WebhookServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, controller):
        self.controller = controller
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(address, WebhookHandler)

    def process_request(self, request, address):
        request.settimeout(10)
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


class WebhookHandler(BaseHTTPRequestHandler):
    def respond(self, status, message):
        body = json.dumps({'message': message}).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200 if self.path == '/healthz' else 404,
                     'Listener alive' if self.path == '/healthz' else 'Not found')

    def do_POST(self):
        if self.path != '/webhook':
            self.respond(404, 'Not found')
            return
        try:
            if self.headers.get('Transfer-Encoding'):
                raise ValueError('Chunked bodies unsupported')
            length = int(self.headers.get('Content-Length', '-1'))
            if not 0 <= length <= 1024 * 1024:
                self.respond(413, 'Invalid body length')
                return
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError('Incomplete body')
            status, message = self.server.controller.receive(dict(self.headers), body)
            self.respond(status, message)
        except (ValueError, TimeoutError):
            self.respond(400, 'Invalid request')
        except Exception:
            # Do not expose event bodies, credentials, or internal exception text.
            self.respond(503, 'Temporarily unavailable')

    def log_message(self, fmt, *args):
        pass

import threading
import http.server
import socketserver
import os

class SimpleHttpServer:
    def __init__(self, root_dir):
        self.root_dir = os.path.abspath(root_dir)
        self.server = None
        self.thread = None
        self.port = None
        self.running = False

    def start(self, port=8000):
        if self.running:
            return False, f"Already running on port {self.port}"

        try:
            # Change to root dir for the server context
            # Note: SimpleHTTPRequestHandler serves CWD, so we need to change dir or subclass
            # Subclassing is safer to not affect the whole process CWD

            directory = self.root_dir

            class Handler(http.server.SimpleHTTPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=directory, **kwargs)

                def log_message(self, format, *args):
                    pass # Silence logs

            self.server = socketserver.TCPServer(("", int(port)), Handler)
            self.port = int(port)
            self.running = True

            self.thread = threading.Thread(target=self.server.serve_forever)
            self.thread.daemon = True
            self.thread.start()

            return True, f"Started on port {port}"
        except Exception as e:
            return False, str(e)

    def stop(self):
        if self.running and self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
            self.running = False
            self.port = None
            return True, "Stopped"
        return False, "Not running"

    def status(self):
        return {
            "running": self.running,
            "port": self.port,
            "path": self.root_dir
        }

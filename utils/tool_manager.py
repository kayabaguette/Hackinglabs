import threading
import subprocess
from wsgidav.wsgidav_app import WsgiDAVApp
from cheroot import wsgi
import os
import glob

class ToolManager:
    def __init__(self):
        self.webdav_server = None
        self.webdav_thread = None
        self.webdav_running = False
        self.webdav_port = 8080
        self.webdav_path = None

    def toggle_webdav(self, root_path=None, port=8080):
        if root_path is None:
            # Default to 'shared' directory in current working directory
            root_path = os.path.join(os.getcwd(), 'shared')
            if not os.path.exists(root_path):
                os.makedirs(root_path)

        if self.webdav_running:
            self.stop_webdav()
            return "stopped"
        else:
            self.start_webdav(root_path, port)
            return "running"

    def start_webdav(self, root_path, port):
        if self.webdav_running:
            return

        def run_server():
            # Basic configuration for WebDAV
            config = {
                "host": "0.0.0.0",
                "port": port,
                "provider_mapping": {"/": root_path},
                "simple_dc": {"user_mapping": {"*": True}},  # Anonymous access allowed for CTF
                "verbose": 1,
            }
            app = WsgiDAVApp(config)

            # Create Cheroot server
            self.webdav_server = wsgi.Server((config["host"], config["port"]), app)
            try:
                self.webdav_server.start()
            except Exception as e:
                print(f"WebDAV error: {e}")
            finally:
                self.webdav_running = False

        self.webdav_thread = threading.Thread(target=run_server, daemon=True)
        self.webdav_thread.start()
        self.webdav_running = True
        self.webdav_port = port
        self.webdav_path = root_path

    def stop_webdav(self):
        if self.webdav_server:
            self.webdav_server.stop()
            self.webdav_server = None
        self.webdav_running = False

    def get_webdav_status(self):
        return {
            "running": self.webdav_running,
            "port": self.webdav_port,
            "path": self.webdav_path or "N/A"
        }

    def list_vpn_configs(self):
        # List all .ovpn files in current directory and vpn/ subdirectory
        files = []
        files.extend(glob.glob("*.ovpn"))
        files.extend(glob.glob("vpn/*.ovpn"))
        return files

    def get_vpn_status(self):
        # Check if openvpn process is running
        try:
            # pgrep returns 0 if process found, 1 if not
            ret = subprocess.call(["pgrep", "openvpn"], stdout=subprocess.DEVNULL)
            return ret == 0
        except Exception:
            return False

tool_manager = ToolManager()

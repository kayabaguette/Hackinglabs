import pty
import os
import subprocess
import struct
import fcntl
import termios

class PTYManager:
    def __init__(self):
        # Key: (sid, term_id) -> {fd, process, history: []}
        self.sessions = {}

    def spawn(self, sid, term_id, cmd=None):
        if cmd is None:
            cmd = ["/bin/bash"]

        key = (sid, term_id)
        if key in self.sessions:
            # Already exists, ignore or restart? Let's ignore.
            return self.sessions[key]["fd"]

        # create pseudo-terminal
        master_fd, slave_fd = pty.openpty()

        env = os.environ.copy()
        env["TERM"] = "xterm-256color"

        p = subprocess.Popen(
            cmd,
            preexec_fn=os.setsid,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            env=env,
            shell=False
        )
        os.close(slave_fd) # Close slave in parent

        self.sessions[key] = {"fd": master_fd, "process": p, "history": []}
        return master_fd

    def write(self, sid, term_id, data):
        key = (sid, term_id)
        if key in self.sessions:
            fd = self.sessions[key]["fd"]
            try:
                if isinstance(data, str):
                    data = data.encode('utf-8')
                os.write(fd, data)
            except OSError:
                pass

    def resize(self, sid, term_id, cols, rows):
        key = (sid, term_id)
        if key in self.sessions:
            fd = self.sessions[key]["fd"]
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            try:
                fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

    def close(self, sid, term_id):
        key = (sid, term_id)
        if key in self.sessions:
            self._close_session(key)

    def close_all_for_sid(self, sid):
        # Find all keys matching sid
        keys_to_close = [k for k in self.sessions.keys() if k[0] == sid]
        for key in keys_to_close:
            self._close_session(key)

    def _close_session(self, key):
        session = self.sessions[key]
        try:
            os.close(session["fd"])
        except OSError:
            pass
        try:
            session["process"].terminate()
            session["process"].wait(timeout=1)
        except:
            pass
        if key in self.sessions:
            del self.sessions[key]

    def append_history(self, sid, term_id, data):
        key = (sid, term_id)
        if key in self.sessions:
            try:
                if isinstance(data, bytes):
                    data = data.decode('utf-8', errors='replace')
                self.sessions[key]["history"].append(data)
            except:
                pass

    def get_history(self, sid, term_id):
        key = (sid, term_id)
        if key in self.sessions:
            return "".join(self.sessions[key]["history"])
        return ""

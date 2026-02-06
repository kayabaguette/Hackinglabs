document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const terminals = {}; // term_id -> { term, fit, el }
    let activeTermId = null;
    let termCounter = 0;

    const sessionList = document.getElementById('session-list');
    const terminalsWrapper = document.getElementById('terminals-wrapper');

    // --- Helpers ---
    function updateWebDAVUI(statusData) {
        const btn = document.getElementById('btn-webdav-toggle');
        const statusDiv = document.getElementById('webdav-status');
        const portInput = document.getElementById('webdav-port');

        if (statusData.running) {
            btn.classList.remove('btn-outline-warning');
            btn.classList.add('btn-warning');
            btn.innerText = 'Stop WebDAV';
            portInput.value = statusData.port;
            portInput.disabled = true;
            statusDiv.innerHTML = `Running on port ${statusData.port}<br><span class="text-truncate d-block" title="${statusData.path}">Path: ...${statusData.path.slice(-15)}</span>`;
        } else {
            btn.classList.add('btn-outline-warning');
            btn.classList.remove('btn-warning');
            btn.innerText = 'Start WebDAV';
            portInput.disabled = false;
            statusDiv.innerText = 'Status: Stopped';
        }
    }

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

        // Close button
        const closeBtn = document.createElement('i');
        closeBtn.className = 'bi bi-x-lg text-secondary';
        closeBtn.style.fontSize = '0.8rem';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if(confirm('Close this terminal?')) {
                closeTerminal(termId);
            }
        };
        tab.appendChild(closeBtn);

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

    // --- Socket Events ---
    socket.on('connect', () => {
        document.getElementById('connection-status').className = 'badge bg-success';
        document.getElementById('connection-status').innerText = 'Connected';

        if (Object.keys(terminals).length === 0) {
            createTerminal('default');
        }

        // Fetch statuses
        fetch('/api/tools/webdav/status')
            .then(r => r.json())
            .then(data => updateWebDAVUI(data));

        fetch('/api/tools/vpn/list')
            .then(r => r.json())
            .then(data => {
                const sel = document.getElementById('vpn-config-select');
                sel.innerHTML = '<option value="">Select Config...</option>';
                data.configs.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.innerText = c;
                    sel.appendChild(opt);
                });
            });
    });

    socket.on('output', data => {
        if (data.term_id && terminals[data.term_id]) {
            terminals[data.term_id].term.write(data.output);
        }
    });

    socket.on('disconnect_terminal', data => {
        // Backend says process died
        if (data.term_id) {
             terminals[data.term_id].term.write('\r\n\x1b[31m[Process Exited]\x1b[0m\r\n');
        }
    });

    socket.on('disconnect', () => {
        document.getElementById('connection-status').className = 'badge bg-danger';
        document.getElementById('connection-status').innerText = 'Disconnected';
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
        const cmd = document.getElementById('nmap-command').value;
        if(cmd && activeTermId && terminals[activeTermId]) {
             terminals[activeTermId].term.write(`\r\n\x1b[32m[System] Running: ${cmd}\x1b[0m\r\n`);
             socket.emit('input', { term_id: activeTermId, input: `${cmd}\n` });
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

    // --- Split.js Initialization ---
    Split(['#left-panel', '#right-panel'], {
        sizes: [75, 25],
        minSize: [200, 200],
        gutterSize: 5,
        cursor: 'col-resize',
        onDragEnd: () => {
            if (activeTermId && terminals[activeTermId]) {
                terminals[activeTermId].fit.fit();
                const t = terminals[activeTermId];
                socket.emit('resize', { term_id: activeTermId, cols: t.term.cols, rows: t.term.rows });
            }
        },
        // Also fit during drag for smoother experience, maybe throttled?
        onDrag: () => {
             if (activeTermId && terminals[activeTermId]) {
                terminals[activeTermId].fit.fit();
            }
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const terminals = {}; // term_id -> { term, fit, el }
    let activeTermId = null;
    let termCounter = 0;

    const sessionList = document.getElementById('session-list');
    const terminalsWrapper = document.getElementById('terminals-wrapper');

    function createTerminal(termId) {
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
        const tab = document.createElement('button');
        tab.className = 'list-group-item list-group-item-action border-0 text-light mb-1';
        tab.style.cursor = 'pointer';
        // Set label
        if (termId === 'default') {
            tab.innerText = 'Local / Control';
        } else {
            tab.innerText = `Terminal ${termCounter}`;
        }

        tab.dataset.termId = termId;
        tab.onclick = () => setActiveTerminal(termId);
        sessionList.appendChild(tab);

        // Activate immediately
        setActiveTerminal(termId);

        // Wait for element to be visible/layout before fitting
        requestAnimationFrame(() => {
             fitAddon.fit();
             socket.emit('start_terminal', { term_id: termId, cols: term.cols, rows: term.rows });
        });
    }

    function setActiveTerminal(termId) {
        // Hide current
        if (activeTermId && terminals[activeTermId]) {
            terminals[activeTermId].el.style.display = 'none';
            const oldTab = sessionList.querySelector(`[data-term-id="${activeTermId}"]`);
            if (oldTab) {
                oldTab.classList.remove('active', 'bg-secondary');
                oldTab.classList.add('bg-dark'); // or whatever default style
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
                newTab.classList.remove('bg-dark');
            }

            // Re-sync size just in case
            socket.emit('resize', { term_id: termId, cols: t.term.cols, rows: t.term.rows });
        }
    }

    // Socket Events
    socket.on('connect', () => {
        document.getElementById('connection-status').className = 'badge bg-success';
        document.getElementById('connection-status').innerText = 'Connected';

        // On new connection, create default terminal if none exist
        if (Object.keys(terminals).length === 0) {
            createTerminal('default');
        }
    });

    socket.on('output', data => {
        if (data.term_id && terminals[data.term_id]) {
            terminals[data.term_id].term.write(data.output);
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

    // Buttons
    document.getElementById('btn-new-term').addEventListener('click', () => createTerminal());

    document.getElementById('btn-webdav').addEventListener('click', () => {
        fetch('/api/tools/webdav/toggle', {method: 'POST'})
            .then(r => r.json())
            .then(data => {
                if(activeTermId && terminals[activeTermId]) {
                    const color = data.status === 'running' ? '\x1b[32m' : '\x1b[31m';
                    terminals[activeTermId].term.write(`\r\n${color}[System] WebDAV: ${data.status}\x1b[0m\r\n`);
                }
            });
    });

    document.getElementById('btn-vpn').addEventListener('click', () => {
         if(activeTermId && terminals[activeTermId]) {
            terminals[activeTermId].term.write(`\r\n\x1b[33m[System] Sending VPN command...\x1b[0m\r\n`);
            socket.emit('input', { term_id: activeTermId, input: "sudo openvpn --config client.ovpn\n" });
         }
    });

    document.getElementById('btn-nmap').addEventListener('click', () => {
        const ip = document.getElementById('target-ip').value;
        if(ip && activeTermId && terminals[activeTermId]) {
             terminals[activeTermId].term.write(`\r\n\x1b[32m[System] Starting Nmap...\x1b[0m\r\n`);
             socket.emit('input', { term_id: activeTermId, input: `nmap -sC -sV ${ip}\n` });
        }
    });
});

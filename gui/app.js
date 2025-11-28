// Global state
let isMessageWindowVisible = true;
let currentStackup = [];
let currentUnits = 'mm';

// Tab Switching Logic
function openTab(tabId) {
    const panes = document.querySelectorAll('.tab-pane');
    panes.forEach(pane => pane.classList.remove('active'));
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const activeBtn = document.querySelector(`.tab-btn[onclick="openTab('${tabId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Redraw visualizer if switching to Stackup tab
    if (tabId === 'tab-stackup') {
        render2DView();
    } else if (tabId === 'tab-padstack') {
        renderPadstackTab();
    }
}

// Menu Logic
function toggleMessageWindow() {
    const msgWindow = document.getElementById('message-window');
    isMessageWindowVisible = !isMessageWindowVisible;
    if (isMessageWindowVisible) {
        msgWindow.classList.remove('hidden');
    } else {
        msgWindow.classList.add('hidden');
    }
}

function addMessage(msg) {
    const msgBody = document.getElementById('message-body');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    msgBody.appendChild(entry);
    msgBody.scrollTop = msgBody.scrollHeight;

    // Also log to Python console for debugging
    if (window.pywebview) {
        console.log(msg);
    }
}

function clearMessages() {
    document.getElementById('message-body').innerHTML = '';
}

// Global Error Handler
window.onerror = function (message, source, lineno, colno, error) {
    addMessage(`JS Error: ${message} at ${source}:${lineno}`);
    return false;
};

// Stackup Logic
function createNewStackup() {
    try {
        const n = parseInt(document.getElementById('layer-count').value);
        if (!n || n < 1) {
            alert("Please enter a valid number of layers.");
            return;
        }

        currentStackup = [];
        // Pattern: Dielectric - Conductor - Dielectric ...
        // Total items = 2*n + 1 (n conductors, n+1 dielectrics)

        // Top Dielectric (SolderMask)
        currentStackup.push(createLayer("SolderMask_Top", "Dielectric", 0.02, 3.5, 0.02, "", ""));

        for (let i = 1; i <= n; i++) {
            // Conductor
            currentStackup.push(createLayer(`L${i}`, "Conductor", 0.035, "", "", 5.8e7, "FR4", false));
            // Dielectric (between layers or bottom)
            if (i < n) {
                currentStackup.push(createLayer(`Dielectric_${i}_${i + 1}`, "Dielectric", 0.1, 4.4, 0.02, "", ""));
            }
        }

        // Bottom Dielectric (SolderMask)
        currentStackup.push(createLayer("SolderMask_Bottom", "Dielectric", 0.02, 3.5, 0.02, "", ""));

        renderStackupTable();
        render2DView();
        addMessage(`Created new stackup with ${n} conductor layers.`);
    } catch (e) {
        addMessage(`Error creating stackup: ${e}`);
        console.error(e);
        alert(`Error creating stackup: ${e}`);
    }
}

function createLayer(name, type, thickness, dk, df, cond, fill, isRef) {
    return {
        name: name,
        type: type,
        thickness: thickness,
        dk: dk,
        df: df,
        conductivity: cond,
        fillMaterial: fill,
        isReference: isRef
    };
}

function renderStackupTable() {
    const tbody = document.querySelector('#stackup-table tbody');
    if (!tbody) {
        addMessage("Error: tbody not found!");
        return;
    }
    tbody.innerHTML = '';

    currentStackup.forEach((layer, index) => {
        const tr = document.createElement('tr');

        // Apply row color class based on type
        if (layer.type === 'Conductor') {
            tr.classList.add('row-conductor');
        } else if (layer.type === 'Dielectric') {
            tr.classList.add('row-dielectric');
        }

        // Helper to create input cell
        const createInput = (key, type = 'text', disabled = false) => {
            return `<input type="${type}" value="${layer[key] !== undefined ? layer[key] : ''}" 
                    onchange="updateLayer(${index}, '${key}', this.value)" ${disabled ? 'disabled' : ''}>`;
        };

        // Helper to create select cell
        const createSelect = (key, options) => {
            const opts = options.map(o => `<option value="${o}" ${layer[key] === o ? 'selected' : ''}>${o}</option>`).join('');
            return `<select onchange="updateLayer(${index}, '${key}', this.value)">${opts}</select>`;
        };

        // Helper to create checkbox
        const createCheckbox = (key, disabled = false) => {
            if (disabled) return '';
            return `<input type="checkbox" ${layer[key] ? 'checked' : ''} 
                    onchange="updateLayer(${index}, '${key}', this.checked)">`;
        };

        tr.innerHTML = `
            <td>${createInput('name')}</td>
            <td>${createSelect('type', ['Conductor', 'Dielectric'])}</td>
            <td>${createInput('thickness', 'number')}</td>
            <td>${createInput('dk', 'number', layer.type === 'Conductor')}</td>
            <td>${createInput('df', 'number', layer.type === 'Conductor')}</td>
            <td>${createInput('conductivity', 'number', layer.type === 'Dielectric')}</td>
            <td>${createInput('fillMaterial', 'text', layer.type === 'Dielectric')}</td>
            <td>${createCheckbox('isReference', layer.type !== 'Conductor')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateLayer(index, key, value) {
    if (key === 'thickness' || key === 'dk' || key === 'df' || key === 'conductivity') {
        value = parseFloat(value);
    }
    currentStackup[index][key] = value;

    // Re-render if type changes to update disabled fields
    if (key === 'type') {
        // Clear irrelevant properties when type changes
        if (value === 'Conductor') {
            currentStackup[index].dk = "";
            currentStackup[index].df = "";
            currentStackup[index].fillMaterial = "";
        } else {
            currentStackup[index].conductivity = "";
            currentStackup[index].isReference = false;
        }
        renderStackupTable();
    }
    render2DView();
}

function toggleUnits(unit) {
    if (unit === currentUnits) return;

    const factor = unit === 'mm' ? 0.0254 : 1 / 0.0254; // mil to mm = *0.0254

    currentStackup.forEach(layer => {
        if (layer.thickness) {
            layer.thickness = parseFloat((layer.thickness * factor).toFixed(4));
        }
    });

    currentUnits = unit;
    renderStackupTable();
    addMessage(`Units switched to ${unit}`);
}

function handlePaste(event) {
    event.preventDefault();
    const clipboardData = event.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text');

    const rows = pastedData.trim().split('\n');
    if (rows.length === 0) return;

    currentStackup = [];
    rows.forEach(row => {
        const cols = row.split('\t');
        if (cols.length >= 3) {
            currentStackup.push({
                name: cols[0] || "Layer",
                type: cols[1] || "Dielectric",
                thickness: parseFloat(cols[2]) || 0,
                dk: parseFloat(cols[3]) || "",
                df: parseFloat(cols[4]) || "",
                conductivity: parseFloat(cols[5]) || "",
                fillMaterial: cols[6] || "",
                isReference: cols[7] && (cols[7].toLowerCase() === 'true' || cols[7] === '1')
            });
        }
    });

    renderStackupTable();
    render2DView();
    addMessage(`Pasted ${currentStackup.length} layers.`);
}

function render2DView() {
    const container = document.getElementById('stackup-visualizer');
    container.innerHTML = ''; // Clear

    if (currentStackup.length === 0) return;

    const totalThickness = currentStackup.reduce((sum, l) => sum + (l.thickness || 0), 0);
    if (totalThickness === 0) return;

    const height = container.clientHeight;
    const scaleY = (height - 20) / totalThickness; // Padding 10px
    let currentY = 10;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    currentStackup.forEach(layer => {
        const h = (layer.thickness || 0) * scaleY;
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", "10%");
        rect.setAttribute("y", currentY);
        rect.setAttribute("width", "80%");
        rect.setAttribute("height", h);

        if (layer.type === 'Conductor') {
            rect.setAttribute("fill", "#b87333"); // Copper
        } else {
            rect.setAttribute("fill", "#4a6fa5"); // Dielectric
            rect.setAttribute("opacity", "0.5");
        }
        rect.setAttribute("stroke", "#666");
        rect.setAttribute("stroke-width", "1");

        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${layer.name} (${layer.thickness} ${currentUnits})`;
        rect.appendChild(title);

        svg.appendChild(rect);
        currentY += h;
    });

    container.appendChild(svg);
}

// Python API Wrappers
async function openFile() {
    if (window.pywebview) {
        try {
            const data = await window.pywebview.api.open_file_dialog();
            if (data) {
                if (typeof data === 'string' && data.endsWith('.xml')) {
                    addMessage(`Parsing file: ${data}`);
                    const stackup = await window.pywebview.api.parse_stackup_xml(data);
                    addMessage(`Received ${stackup ? stackup.length : 'null'} layers.`);

                    if (stackup) {
                        currentStackup = stackup;
                        renderStackupTable();
                        render2DView();
                        addMessage(`Loaded stackup from ${data}`);
                    }
                } else {
                    addMessage("Selected file is not an XML file.");
                }
            }
        } catch (error) {
            addMessage(`Error in openFile: ${error}`);
            console.error(error);
            alert(`Error in openFile: ${error}`);
        }
    }
}

async function saveStackup() {
    if (window.pywebview) {
        await window.pywebview.api.save_stackup_xml("stackup_export.xml", currentStackup);
        addMessage("Stackup saved.");
    }
}

async function saveProject() {
    if (window.pywebview) await window.pywebview.api.save_project();
}

async function loadProject() {
    if (window.pywebview) await window.pywebview.api.load_project();
}

async function exitApp() {
    if (window.pywebview) await window.pywebview.api.exit_app();
}

// Padstack Logic
let padstacks = [];
let currentPadstackIndex = -1;

function renderPadstackTab() {
    const warningDiv = document.getElementById('padstack-warning');
    const contentDiv = document.getElementById('padstack-content');

    if (!currentStackup || currentStackup.length === 0) {
        if (warningDiv) warningDiv.classList.remove('hidden');
        if (contentDiv) contentDiv.classList.add('hidden');
        return;
    } else {
        if (warningDiv) warningDiv.classList.add('hidden');
        if (contentDiv) contentDiv.classList.remove('hidden');
    }

    renderPadstackList();
    renderPadstackForm();
    renderPadstackLayersTable();
}

function addPadstack() {
    const name = `Padstack_${padstacks.length + 1}`;
    const newPadstack = {
        name: name,
        holeDiameter: 0.2,
        material: "Copper",
        plating: 100,
        startLayer: currentStackup.length > 0 ? currentStackup[0].name : "",
        stopLayer: currentStackup.length > 0 ? currentStackup[currentStackup.length - 1].name : "",
        backdrill: {
            enabled: false,
            diameter: 0.3,
            mode: "layer", // or 'depth'
            toLayer: "",
            stub: 0,
            depth: 0
        },
        layers: {} // Map layerName -> {padSize, antipadSize}
    };

    padstacks.push(newPadstack);
    currentPadstackIndex = padstacks.length - 1;
    renderPadstackTab();
}

function deletePadstack() {
    if (currentPadstackIndex >= 0 && currentPadstackIndex < padstacks.length) {
        padstacks.splice(currentPadstackIndex, 1);
        currentPadstackIndex = padstacks.length > 0 ? 0 : -1;
        renderPadstackTab();
    }
}

function selectPadstack(index) {
    currentPadstackIndex = index;
    renderPadstackTab();
}

function renderPadstackList() {
    const list = document.getElementById('padstack-list');
    if (!list) return;
    list.innerHTML = '';
    padstacks.forEach((p, i) => {
        const li = document.createElement('li');
        li.textContent = p.name;
        if (i === currentPadstackIndex) li.classList.add('active');
        li.onclick = () => selectPadstack(i);
        list.appendChild(li);
    });
}

function renderPadstackForm() {
    if (currentPadstackIndex === -1) {
        // Disable inputs or clear them
        const inputs = ['pad-name', 'pad-hole-diam', 'pad-material', 'pad-plating', 'pad-start-layer', 'pad-stop-layer'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        return;
    }

    const p = padstacks[currentPadstackIndex];
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('pad-name', p.name);
    setVal('pad-hole-diam', p.holeDiameter);
    setVal('pad-material', p.material);
    setVal('pad-plating', p.plating);

    // Populate Layer Dropdowns (Conductors only)
    const startSelect = document.getElementById('pad-start-layer');
    const stopSelect = document.getElementById('pad-stop-layer');

    if (startSelect && stopSelect) {
        startSelect.innerHTML = '';
        stopSelect.innerHTML = '';

        currentStackup.forEach(l => {
            if (l.type === 'Conductor') {
                startSelect.add(new Option(l.name, l.name));
                stopSelect.add(new Option(l.name, l.name));
            }
        });

        startSelect.value = p.startLayer;
        stopSelect.value = p.stopLayer;
    }

    // Backdrill Config
    const bdCheck = document.getElementById('pad-backdrill-en');
    if (bdCheck) bdCheck.checked = p.backdrill.enabled;

    const bdConfigDiv = document.getElementById('backdrill-inline-config');
    if (bdConfigDiv) {
        if (p.backdrill.enabled) {
            bdConfigDiv.classList.remove('disabled');
        } else {
            bdConfigDiv.classList.add('disabled');
        }
    }

    setVal('bd-diameter', p.backdrill.diameter);

    // Mode Radio
    const radios = document.getElementsByName('bd-mode');
    radios.forEach(r => {
        if (r.value === p.backdrill.mode) r.checked = true;
    });
    toggleBdMode(p.backdrill.mode);

    // Layer Mode Inputs
    const toLayerSelect = document.getElementById('bd-to-layer');
    if (toLayerSelect) {
        toLayerSelect.innerHTML = '';
        currentStackup.forEach(l => {
            if (l.type === 'Conductor') {
                toLayerSelect.add(new Option(l.name, l.name));
            }
        });
        toLayerSelect.value = p.backdrill.toLayer;
    }
    setVal('bd-stub', p.backdrill.stub);

    // Depth Mode Inputs
    setVal('bd-depth', p.backdrill.depth);
}

function updatePadstackProperty(key, value) {
    if (currentPadstackIndex === -1) return;
    const p = padstacks[currentPadstackIndex];
    p[key] = value;
    if (key === 'name') renderPadstackList();
    renderPadstackLayersTable(); // Re-render table as hole diameter might affect defaults
}

function toggleBackdrill(enabled) {
    if (currentPadstackIndex === -1) return;
    padstacks[currentPadstackIndex].backdrill.enabled = enabled;
    const bdConfigDiv = document.getElementById('backdrill-inline-config');
    if (bdConfigDiv) {
        if (enabled) {
            bdConfigDiv.classList.remove('disabled');
        } else {
            bdConfigDiv.classList.add('disabled');
        }
    }
}

function toggleBdMode(mode) {
    if (currentPadstackIndex !== -1) {
        padstacks[currentPadstackIndex].backdrill.mode = mode;
    }

    const layerGroup = document.getElementById('bd-mode-layer-group');
    const depthGroup = document.getElementById('bd-mode-depth-group');

    if (mode === 'layer') {
        if (layerGroup) layerGroup.classList.remove('hidden');
        if (depthGroup) depthGroup.classList.add('hidden');
    } else {
        if (layerGroup) layerGroup.classList.add('hidden');
        if (depthGroup) depthGroup.classList.remove('hidden');
    }
}

function updateBackdrillProperty(key, value) {
    if (currentPadstackIndex === -1) return;
    const p = padstacks[currentPadstackIndex];
    p.backdrill[key] = value;
}

function renderPadstackLayersTable() {
    const tbody = document.querySelector('#padstack-layers-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (currentPadstackIndex === -1) return;
    const p = padstacks[currentPadstackIndex];

    currentStackup.forEach(layer => {
        if (layer.type !== 'Conductor') return; // Only show conductor layers

        const tr = document.createElement('tr');

        // Default sizes if not set
        const padSize = p.layers[layer.name]?.padSize || (p.holeDiameter * 1.5).toFixed(3);
        const antipadSize = p.layers[layer.name]?.antipadSize || (p.holeDiameter * 2.0).toFixed(3);

        tr.innerHTML = `
            <td>${layer.name}</td>
            <td><input type="number" value="${padSize}" onchange="updatePadstackLayer('${layer.name}', 'padSize', this.value)"></td>
            <td><input type="number" value="${antipadSize}" onchange="updatePadstackLayer('${layer.name}', 'antipadSize', this.value)"></td>
        `;
        tbody.appendChild(tr);
    });
}

function updatePadstackLayer(layerName, key, value) {
    if (currentPadstackIndex === -1) return;
    const p = padstacks[currentPadstackIndex];
    if (!p.layers[layerName]) p.layers[layerName] = {};
    p.layers[layerName][key] = parseFloat(value);
}

// Initialize
window.addEventListener('pywebviewready', function () {
    addMessage("Via Wizard GUI Initialized.");
});

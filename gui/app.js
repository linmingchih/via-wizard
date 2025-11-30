// Global state
let isMessageWindowVisible = false;
let currentStackup = [];
let currentUnits = 'mm';

// Tab Switching Logic
// Tab Switching Logic
function openTab(tabId) {
    const panes = document.querySelectorAll('.tab-pane');
    panes.forEach(pane => pane.classList.remove('active'));
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetPane = document.getElementById(tabId);
    if (targetPane) {
        targetPane.classList.add('active');
    }

    // Find button by text content or index since onclick attribute matching can be flaky
    // Or simpler: pass 'this' to the function
    const activeBtn = Array.from(buttons).find(btn => btn.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    // Redraw visualizer if switching to Stackup tab
    if (tabId === 'tab-stackup') {
        render2DView();
    } else if (tabId === 'tab-padstack') {
        renderPadstackTab();
    } else if (tabId === 'tab-placement') {
        renderPlacementTab();
    } else if (tabId === 'tab-simulation') {
        if (!isMessageWindowVisible) {
            toggleMessageWindow();
        }
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
function resetProjectData() {
    // Reset Padstacks
    padstacks = [];
    currentPadstackIndex = -1;
    renderPadstackList();
    renderPadstackForm();

    // Reset Placement
    placedInstances = [];
    selectedInstanceId = null;

    // Clear Placement UI elements if they exist
    const list = document.getElementById('placed-list');
    if (list) list.innerHTML = '';

    const propPanel = document.getElementById('prop-panel-content');
    if (propPanel) propPanel.innerHTML = '<p class="hint">Select an instance to view properties.</p>';

    // Redraw canvas if initialized
    if (typeof drawPlacementCanvas === 'function') {
        drawPlacementCanvas();
    }
}

function createNewStackup() {
    try {
        let n = prompt("Enter number of layers:", "4");
        if (n === null) return;
        n = parseInt(n);

        if (!n || n < 1) {
            alert("Please enter a valid number of layers.");
            return;
        }

        resetProjectData();

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

function createLayer(name, type, thickness, dk, df, cond, fill, isRef = false) {
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

        if (layer.isReference) {
            rect.setAttribute("fill", "#0000ff"); // Blue for Reference
        } else if (layer.type === 'Conductor') {
            rect.setAttribute("fill", "#b87333"); // Copper
        } else {
            rect.setAttribute("fill", "#4caf50"); // Green for Dielectric
            rect.setAttribute("opacity", "0.6");
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
                    const result = await window.pywebview.api.parse_stackup_xml(data);

                    let stackup = result;
                    let unit = 'mm';

                    // Handle new return format {layers: [], unit: ""}
                    if (result && !Array.isArray(result) && result.layers) {
                        stackup = result.layers;
                        unit = result.unit || 'mm';
                    }

                    addMessage(`Received ${stackup ? stackup.length : 'null'} layers.`);

                    if (stackup) {
                        resetProjectData();
                        currentStackup = stackup;

                        // Update unit UI
                        const radio = document.querySelector(`input[name="units"][value="${unit}"]`);
                        if (radio) {
                            radio.checked = true;
                            currentUnits = unit;
                        }

                        renderStackupTable();
                        render2DView();
                        addMessage(`Loaded stackup from ${data} (Unit: ${unit})`);
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
    if (window.pywebview) {
        // Capture board size
        const boardW = parseFloat(document.getElementById('canvas-width').value) || 400;
        const boardH = parseFloat(document.getElementById('canvas-height').value) || 200;

        // Calculate feed paths for all instances
        const instancesWithPaths = placedInstances.map(inst => {
            const feedPaths = calculateFeedPaths(inst, boardW, boardH);
            return { ...inst, feedPaths };
        });

        const projectData = {
            stackup: currentStackup,
            units: currentUnits,
            padstacks: padstacks,
            placedInstances: instancesWithPaths,
            canvasGridSpacing: canvasState.gridSpacing,
            boardWidth: boardW,
            boardHeight: boardH
        };
        await window.pywebview.api.save_project(projectData);
    }
}

function calculateFeedPaths(inst, boardW, boardH) {
    const paths = { feedIn: [], feedOut: [] };

    if (inst.type === 'single') {
        const arrowDir = inst.properties.arrowDirection || 0;

        const getPath = (isFeedIn) => {
            let targetDir = arrowDir;
            if (isFeedIn) targetDir = (arrowDir + 2) % 4;

            let edgeX = inst.x;
            let edgeY = inst.y;

            if (targetDir === 0) edgeY = boardH / 2;
            else if (targetDir === 1) edgeX = boardW / 2;
            else if (targetDir === 2) edgeY = -boardH / 2;
            else if (targetDir === 3) edgeX = -boardW / 2;

            return [{ x: inst.x, y: inst.y }, { x: edgeX, y: edgeY }];
        };

        paths.feedIn.push(getPath(true));
        paths.feedOut.push(getPath(false));

    } else if (inst.type === 'differential') {
        const pitch = inst.properties.pitch || 1.0;
        const isVert = inst.properties.orientation === 'vertical';
        const dx = isVert ? 0 : pitch / 2;
        const dy = isVert ? pitch / 2 : 0;
        const v1 = { x: inst.x - dx, y: inst.y - dy };
        const v2 = { x: inst.x + dx, y: inst.y + dy };

        const getDiffPaths = (isFeedIn) => {
            const width = isFeedIn ? inst.properties.feedInWidth : inst.properties.feedOutWidth;
            const spacing = isFeedIn ? inst.properties.feedInSpacing : inst.properties.feedOutSpacing;
            if (!width || width <= 0) return [];

            const tracePitch = width + spacing;
            const arrowDir = inst.properties.arrowDirection || 0;

            let vias = [v1, v2];
            let resultPaths = [];

            if (arrowDir === 0) { // Up
                vias.sort((a, b) => a.x - b.x);
                const t1x = inst.x - tracePitch / 2;
                const t2x = inst.x + tracePitch / 2;
                const edgeY = isFeedIn ? -boardH / 2 : boardH / 2;

                if (isFeedIn) {
                    const k1y = vias[0].y - Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y - Math.abs(vias[1].x - t2x);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: t1x, y: k1y }, { x: t1x, y: edgeY }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: t2x, y: k2y }, { x: t2x, y: edgeY }]);
                } else {
                    const k1y = vias[0].y + Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y + Math.abs(vias[1].x - t2x);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: t1x, y: k1y }, { x: t1x, y: edgeY }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: t2x, y: k2y }, { x: t2x, y: edgeY }]);
                }
            } else if (arrowDir === 1) { // Right
                vias.sort((a, b) => a.y - b.y);
                const t1y = inst.y - tracePitch / 2;
                const t2y = inst.y + tracePitch / 2;
                const edgeX = isFeedIn ? -boardW / 2 : boardW / 2;

                if (isFeedIn) {
                    const k1x = vias[0].x - Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x - Math.abs(vias[1].y - t2y);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: k1x, y: t1y }, { x: edgeX, y: t1y }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: k2x, y: t2y }, { x: edgeX, y: t2y }]);
                } else {
                    const k1x = vias[0].x + Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x + Math.abs(vias[1].y - t2y);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: k1x, y: t1y }, { x: edgeX, y: t1y }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: k2x, y: t2y }, { x: edgeX, y: t2y }]);
                }
            } else if (arrowDir === 2) { // Down
                vias.sort((a, b) => a.x - b.x);
                const t1x = inst.x - tracePitch / 2;
                const t2x = inst.x + tracePitch / 2;
                const edgeY = isFeedIn ? boardH / 2 : -boardH / 2;

                if (isFeedIn) {
                    const k1y = vias[0].y + Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y + Math.abs(vias[1].x - t2x);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: t1x, y: k1y }, { x: t1x, y: edgeY }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: t2x, y: k2y }, { x: t2x, y: edgeY }]);
                } else {
                    const k1y = vias[0].y - Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y - Math.abs(vias[1].x - t2x);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: t1x, y: k1y }, { x: t1x, y: edgeY }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: t2x, y: k2y }, { x: t2x, y: edgeY }]);
                }
            } else if (arrowDir === 3) { // Left
                vias.sort((a, b) => a.y - b.y);
                const t1y = inst.y - tracePitch / 2;
                const t2y = inst.y + tracePitch / 2;
                const edgeX = isFeedIn ? boardW / 2 : -boardW / 2;

                if (isFeedIn) {
                    const k1x = vias[0].x + Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x + Math.abs(vias[1].y - t2y);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: k1x, y: t1y }, { x: edgeX, y: t1y }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: k2x, y: t2y }, { x: edgeX, y: t2y }]);
                } else {
                    const k1x = vias[0].x - Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x - Math.abs(vias[1].y - t2y);
                    resultPaths.push([{ x: vias[0].x, y: vias[0].y }, { x: k1x, y: t1y }, { x: edgeX, y: t1y }]);
                    resultPaths.push([{ x: vias[1].x, y: vias[1].y }, { x: k2x, y: t2y }, { x: edgeX, y: t2y }]);
                }
            }
            return resultPaths;
        };

        paths.feedIn = getDiffPaths(true);
        paths.feedOut = getDiffPaths(false);
    }

    return paths;
}

async function loadProject() {
    if (window.pywebview) {
        const data = await window.pywebview.api.load_project();
        if (data) {
            // Restore Stackup
            if (data.stackup) {
                currentStackup = data.stackup;
                renderStackupTable();
                render2DView();
            }

            // Restore Units
            if (data.units) {
                currentUnits = data.units;
                const radio = document.querySelector(`input[name="units"][value="${currentUnits}"]`);
                if (radio) radio.checked = true;
            }

            // Restore Padstacks
            if (data.padstacks) {
                padstacks = data.padstacks;
                renderPadstackList();
                if (padstacks.length > 0) {
                    selectPadstack(0);
                } else {
                    currentPadstackIndex = -1;
                    document.getElementById('padstack-list').innerHTML = '';
                    // Clear form
                }
            }

            // Restore Placement
            if (data.placedInstances) {
                placedInstances = data.placedInstances;
            } else {
                placedInstances = [];
            }

            if (data.canvasGridSpacing) {
                canvasState.gridSpacing = data.canvasGridSpacing;
                const gridInput = document.getElementById('grid-spacing');
                if (gridInput) gridInput.value = canvasState.gridSpacing;
            }

            if (data.boardWidth) {
                const wInput = document.getElementById('canvas-width');
                if (wInput) wInput.value = data.boardWidth;
            }
            if (data.boardHeight) {
                const hInput = document.getElementById('canvas-height');
                if (hInput) hInput.value = data.boardHeight;
            }

            // Re-render placement
            renderPlacementTab();

            addMessage("Project loaded successfully.");
        }
    }
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
        holeDiameter: 10,
        padSize: 18,
        antipadSize: 28,
        material: "Copper",
        plating: 100,
        startLayer: (() => {
            const conductors = currentStackup.filter(l => l.type === 'Conductor');
            return conductors.length > 0 ? conductors[0].name : "";
        })(),
        stopLayer: (() => {
            const conductors = currentStackup.filter(l => l.type === 'Conductor');
            return conductors.length > 0 ? conductors[conductors.length - 1].name : "";
        })(),
        backdrill: {
            enabled: false,
            diameter: 0.3,
            mode: "layer", // or 'depth'
            toLayer: "",
            stub: 0,
            depth: 0
        },
        layers: {} // Map layerName -> {padSize, antipadSize} (kept for compatibility or future use)
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
        const inputs = ['pad-name', 'pad-hole-diam', 'pad-size', 'pad-antipad-size', 'pad-material', 'pad-plating', 'pad-start-layer', 'pad-stop-layer'];
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
    setVal('pad-size', p.padSize);
    setVal('pad-antipad-size', p.antipadSize);
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
    if (key === 'holeDiameter' || key === 'padSize' || key === 'antipadSize' || key === 'plating') {
        value = parseFloat(value);
    }
    p[key] = value;
    if (key === 'name') renderPadstackList();
    if (typeof drawPlacementCanvas === 'function') {
        drawPlacementCanvas();
    }
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
    // Deprecated: Layer definition table removed from UI
}

function updatePadstackLayer(layerName, key, value) {
    if (currentPadstackIndex === -1) return;
    const p = padstacks[currentPadstackIndex];
    if (!p.layers[layerName]) p.layers[layerName] = {};
    p.layers[layerName][key] = parseFloat(value);
}

async function exportAEDB() {
    if (window.pywebview) {
        const versionInput = document.getElementById('aedb-version');
        const version = versionInput ? versionInput.value : '2024.1';

        // Capture board size
        const wInput = document.getElementById('canvas-width');
        const hInput = document.getElementById('canvas-height');
        const boardW = wInput ? (parseFloat(wInput.value) || 400) : 400;
        const boardH = hInput ? (parseFloat(hInput.value) || 200) : 200;

        // Calculate feed paths for all instances
        const instancesWithPaths = placedInstances.map(inst => {
            const feedPaths = calculateFeedPaths(inst, boardW, boardH);
            return { ...inst, feedPaths };
        });

        const projectData = {
            stackup: currentStackup,
            units: currentUnits,
            padstacks: padstacks,
            placedInstances: instancesWithPaths,
            canvasGridSpacing: canvasState.gridSpacing,
            boardWidth: boardW,
            boardHeight: boardH
        };

        addMessage(`Exporting to AEDB version ${version}...`);
        await window.pywebview.api.export_aedb(projectData, version);
    }
}

// Initialize
window.addEventListener('pywebviewready', function () {
    addMessage("Via Wizard GUI Initialized.");
    pywebview.api.parse_stackup_xml('stack.xml').then(layers => {
        if (layers && layers.length > 0) {
            currentStackup = layers;
            renderStackupTable();
            render2DView();
            addMessage(`Loaded ${layers.length} layers from stack.xml`);
        } else {
            addMessage("Failed to load layers from stack.xml");
        }
    }).catch(err => {
        addMessage("Error loading stackup: " + err);
    });
});

// Placement Logic
let placedInstances = [];
let canvasState = {
    scale: 10, // pixels per unit (mil/mm)
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    gridSpacing: 5
};
let selectedInstanceId = null;
let placementMode = 'single'; // single, differential, gnd

function renderPlacementTab() {
    const padstackSelect = document.getElementById('placement-padstack-select');
    if (padstackSelect) {
        padstackSelect.innerHTML = '';
        padstacks.forEach((p, i) => {
            padstackSelect.add(new Option(p.name, i));
        });
    }

    updatePlacementMode();
    initCanvas();
    drawPlacementCanvas();
    renderPlacedList();
}

function updatePlacementMode() {
    const radios = document.getElementsByName('place-type');
    radios.forEach(r => {
        if (r.checked) placementMode = r.value;
    });

    const diffSettings = document.getElementById('diff-settings');
    if (placementMode === 'differential') {
        diffSettings.classList.remove('hidden');
    } else {
        diffSettings.classList.add('hidden');
    }
}

let canvasInitialized = false;
let canvas, ctx;

function initCanvas() {
    if (canvasInitialized) return;

    canvas = document.getElementById('placement-canvas');
    const wrapper = document.getElementById('canvas-wrapper');

    if (!canvas || !wrapper) return;

    ctx = canvas.getContext('2d');

    // Resize canvas to fit wrapper
    const resizeObserver = new ResizeObserver(() => {
        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;
        canvasState.offsetX = canvas.width / 2;
        canvasState.offsetY = canvas.height / 2;
        drawPlacementCanvas();
    });
    resizeObserver.observe(wrapper);

    // Event Listeners
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('wheel', handleCanvasWheel);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);

    // Keyboard events
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' && selectedInstanceId) {
            deleteInstance(selectedInstanceId);
        }
    });

    // Board Size Inputs
    const wInput = document.getElementById('canvas-width');
    const hInput = document.getElementById('canvas-height');
    if (wInput) {
        wInput.addEventListener('change', drawPlacementCanvas);
        wInput.addEventListener('input', drawPlacementCanvas);
    }
    if (hInput) {
        hInput.addEventListener('change', drawPlacementCanvas);
        hInput.addEventListener('input', drawPlacementCanvas);
    }

    canvasInitialized = true;
}

function drawPlacementCanvas() {
    if (!ctx || !canvas) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    // Transform
    ctx.save();
    ctx.translate(canvasState.offsetX, canvasState.offsetY);
    ctx.scale(canvasState.scale, -canvasState.scale);

    // Draw Grid
    drawGrid();

    // Draw Board Outline (Green Transparent Rectangle)
    const boardW = parseFloat(document.getElementById('canvas-width').value) || 0;
    const boardH = parseFloat(document.getElementById('canvas-height').value) || 0;

    if (boardW > 0 && boardH > 0) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.fillRect(-boardW / 2, -boardH / 2, boardW, boardH);

        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 2 / canvasState.scale;
        ctx.strokeRect(-boardW / 2, -boardH / 2, boardW, boardH);
    }

    // Draw Axes
    ctx.beginPath();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2 / canvasState.scale;
    ctx.moveTo(-1000, 0); ctx.lineTo(1000, 0); // X Axis
    ctx.moveTo(0, -1000); ctx.lineTo(0, 1000); // Y Axis
    ctx.stroke();

    // Draw Instances
    placedInstances.forEach(inst => {
        drawInstance(inst, boardW, boardH);
    });

    ctx.restore();
}

function drawGrid() {
    const spacing = canvasState.gridSpacing;
    const steps = 100; // Draw 100 grid lines in each direction

    ctx.beginPath();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1 / canvasState.scale;

    for (let i = -steps; i <= steps; i++) {
        const pos = i * spacing;
        ctx.moveTo(pos, -steps * spacing);
        ctx.lineTo(pos, steps * spacing);
        ctx.moveTo(-steps * spacing, pos);
        ctx.lineTo(steps * spacing, pos);
    }
    ctx.stroke();
}

function drawInstance(inst, boardW, boardH) {
    const pIndex = inst.padstackIndex;
    if (pIndex < 0 || pIndex >= padstacks.length) return;
    const p = padstacks[pIndex];

    // Calculate max pad size
    let diameter = p.padSize || 20;
    if (p.holeDiameter > diameter) diameter = p.holeDiameter;

    // Calculate max antipad size
    let antipadDiameter = p.antipadSize || 30;

    let color = '#b87333';
    if (inst.type === 'gnd') color = '#998877'; // Desaturated for GND
    if (inst.id === selectedInstanceId) color = '#007acc';

    // Helper to draw feed line
    const drawFeedLine = (x, y, width, direction, isFeedIn) => {
        if (!width || width <= 0 || !boardW || !boardH) return;

        ctx.beginPath();
        ctx.strokeStyle = '#cd7f32'; // Bronze color for feed
        ctx.lineWidth = width; // Use actual width (mil)
        ctx.globalAlpha = 0.5; // Semi-transparent

        let edgeX = x;
        let edgeY = y;

        // Direction: 0=Up, 1=Right, 2=Down, 3=Left
        // Arrow Direction indicates signal flow direction.
        // Feed In comes FROM opposite of arrow.
        // Feed Out goes TOWARDS arrow.

        let targetDir = direction;
        if (isFeedIn) {
            // Feed In comes from opposite side
            targetDir = (direction + 2) % 4;
        }

        if (targetDir === 0) { // Up -> To Top Edge
            edgeY = boardH / 2;
        } else if (targetDir === 1) { // Right -> To Right Edge
            edgeX = boardW / 2;
        } else if (targetDir === 2) { // Down -> To Bottom Edge
            edgeY = -boardH / 2;
        } else if (targetDir === 3) { // Left -> To Left Edge
            edgeX = -boardW / 2;
        }

        ctx.moveTo(x, y);
        ctx.lineTo(edgeX, edgeY);
        ctx.stroke();
        ctx.globalAlpha = 1.0; // Reset alpha

        // Draw Layer Name
        const layerName = isFeedIn ? inst.properties.feedIn : inst.properties.feedOut;
        if (layerName) {
            ctx.save();
            ctx.fillStyle = '#fff';
            const fontSize = 12 / canvasState.scale;
            ctx.font = `${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const midX = (x + edgeX) / 2;
            const midY = (y + edgeY) / 2;

            ctx.translate(midX, midY);
            ctx.scale(1, -1); // Unflip Y
            ctx.fillText(layerName, 0, 0);
            ctx.restore();
        }
    };

    if (inst.type === 'single' || inst.type === 'gnd') {
        const effectiveAntipad = (inst.type === 'gnd') ? 0 : antipadDiameter;

        // Draw Feed In/Out Lines
        if (inst.type === 'single') {
            drawFeedLine(inst.x, inst.y, inst.properties.feedInWidth, inst.properties.arrowDirection, true);
            drawFeedLine(inst.x, inst.y, inst.properties.feedOutWidth, inst.properties.arrowDirection, false);
        }

        drawVia(inst.x, inst.y, diameter, color, p.holeDiameter, inst.properties.arrowDirection, effectiveAntipad);
    } else if (inst.type === 'differential') {
        // Draw two vias
        const pitch = inst.properties.pitch || 1.0;
        const isVert = inst.properties.orientation === 'vertical';

        const dx = isVert ? 0 : pitch / 2;
        const dy = isVert ? pitch / 2 : 0;

        const v1 = { x: inst.x - dx, y: inst.y - dy };
        const v2 = { x: inst.x + dx, y: inst.y + dy };

        // Helper to draw differential feeds with 45-degree dogleg
        const drawDiffFeeds = (isFeedIn) => {
            const width = isFeedIn ? inst.properties.feedInWidth : inst.properties.feedOutWidth;
            const spacing = isFeedIn ? inst.properties.feedInSpacing : inst.properties.feedOutSpacing;
            if (!width || width <= 0) return;

            const tracePitch = width + spacing;
            const arrowDir = inst.properties.arrowDirection || 0; // 0=Up, 1=Right, 2=Down, 3=Left

            ctx.beginPath();
            ctx.strokeStyle = '#cd7f32'; // Bronze color for feed
            ctx.lineWidth = width;
            ctx.globalAlpha = 0.5;

            const drawPoly = (pts) => {
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            };

            // Determine Vias and Traces based on direction
            // We sort vias and traces along the "Lateral" axis
            let vias = [v1, v2];
            let lblX = inst.x;
            let lblY = inst.y;

            // Logic for each direction
            if (arrowDir === 0) { // Up (Signal +Y)
                // Lateral: X
                vias.sort((a, b) => a.x - b.x); // Left, Right
                const t1x = inst.x - tracePitch / 2;
                const t2x = inst.x + tracePitch / 2;
                const edgeY = isFeedIn ? -boardH / 2 : boardH / 2;
                lblY = (inst.y + edgeY) / 2;

                if (isFeedIn) { // From Bottom
                    const k1y = vias[0].y - Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y - Math.abs(vias[1].x - t2x);
                    drawPoly([{ x: t1x, y: edgeY }, { x: t1x, y: k1y }, { x: vias[0].x, y: vias[0].y }]);
                    drawPoly([{ x: t2x, y: edgeY }, { x: t2x, y: k2y }, { x: vias[1].x, y: vias[1].y }]);
                } else { // To Top
                    const k1y = vias[0].y + Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y + Math.abs(vias[1].x - t2x);
                    drawPoly([{ x: vias[0].x, y: vias[0].y }, { x: t1x, y: k1y }, { x: t1x, y: edgeY }]);
                    drawPoly([{ x: vias[1].x, y: vias[1].y }, { x: t2x, y: k2y }, { x: t2x, y: edgeY }]);
                }
            } else if (arrowDir === 1) { // Right (Signal +X)
                // Lateral: Y
                vias.sort((a, b) => a.y - b.y); // Bottom, Top
                const t1y = inst.y - tracePitch / 2;
                const t2y = inst.y + tracePitch / 2;
                const edgeX = isFeedIn ? -boardW / 2 : boardW / 2;
                lblX = (inst.x + edgeX) / 2;

                if (isFeedIn) { // From Left
                    const k1x = vias[0].x - Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x - Math.abs(vias[1].y - t2y);
                    drawPoly([{ x: edgeX, y: t1y }, { x: k1x, y: t1y }, { x: vias[0].x, y: vias[0].y }]);
                    drawPoly([{ x: edgeX, y: t2y }, { x: k2x, y: t2y }, { x: vias[1].x, y: vias[1].y }]);
                } else { // To Right
                    const k1x = vias[0].x + Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x + Math.abs(vias[1].y - t2y);
                    drawPoly([{ x: vias[0].x, y: vias[0].y }, { x: k1x, y: t1y }, { x: edgeX, y: t1y }]);
                    drawPoly([{ x: vias[1].x, y: vias[1].y }, { x: k2x, y: t2y }, { x: edgeX, y: t2y }]);
                }
            } else if (arrowDir === 2) { // Down (Signal -Y)
                // Lateral: X
                vias.sort((a, b) => a.x - b.x); // Left, Right
                const t1x = inst.x - tracePitch / 2;
                const t2x = inst.x + tracePitch / 2;
                const edgeY = isFeedIn ? boardH / 2 : -boardH / 2;
                lblY = (inst.y + edgeY) / 2;

                if (isFeedIn) { // From Top
                    const k1y = vias[0].y + Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y + Math.abs(vias[1].x - t2x);
                    drawPoly([{ x: t1x, y: edgeY }, { x: t1x, y: k1y }, { x: vias[0].x, y: vias[0].y }]);
                    drawPoly([{ x: t2x, y: edgeY }, { x: t2x, y: k2y }, { x: vias[1].x, y: vias[1].y }]);
                } else { // To Bottom
                    const k1y = vias[0].y - Math.abs(vias[0].x - t1x);
                    const k2y = vias[1].y - Math.abs(vias[1].x - t2x);
                    drawPoly([{ x: vias[0].x, y: vias[0].y }, { x: t1x, y: k1y }, { x: t1x, y: edgeY }]);
                    drawPoly([{ x: vias[1].x, y: vias[1].y }, { x: t2x, y: k2y }, { x: t2x, y: edgeY }]);
                }
            } else if (arrowDir === 3) { // Left (Signal -X)
                // Lateral: Y
                vias.sort((a, b) => a.y - b.y); // Bottom, Top
                const t1y = inst.y - tracePitch / 2;
                const t2y = inst.y + tracePitch / 2;
                const edgeX = isFeedIn ? boardW / 2 : -boardW / 2;
                lblX = (inst.x + edgeX) / 2;

                if (isFeedIn) { // From Right
                    const k1x = vias[0].x + Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x + Math.abs(vias[1].y - t2y);
                    drawPoly([{ x: edgeX, y: t1y }, { x: k1x, y: t1y }, { x: vias[0].x, y: vias[0].y }]);
                    drawPoly([{ x: edgeX, y: t2y }, { x: k2x, y: t2y }, { x: vias[1].x, y: vias[1].y }]);
                } else { // To Left
                    const k1x = vias[0].x - Math.abs(vias[0].y - t1y);
                    const k2x = vias[1].x - Math.abs(vias[1].y - t2y);
                    drawPoly([{ x: vias[0].x, y: vias[0].y }, { x: k1x, y: t1y }, { x: edgeX, y: t1y }]);
                    drawPoly([{ x: vias[1].x, y: vias[1].y }, { x: k2x, y: t2y }, { x: edgeX, y: t2y }]);
                }
            }

            ctx.stroke();
            ctx.globalAlpha = 1.0;

            // Draw Layer Name
            const layerName = isFeedIn ? inst.properties.feedIn : inst.properties.feedOut;
            if (layerName) {
                ctx.save();
                ctx.fillStyle = '#fff';
                const fontSize = 12 / canvasState.scale;
                ctx.font = `${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.translate(lblX, lblY);
                ctx.scale(1, -1);
                ctx.fillText(layerName, 0, 0);
                ctx.restore();
            }
        };

        drawDiffFeeds(true);  // Feed In
        drawDiffFeeds(false); // Feed Out

        // Draw Oblong Antipad
        if (antipadDiameter && antipadDiameter > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#aaa';
            ctx.setLineDash([4, 2]); // Dashed
            ctx.lineWidth = 1 / canvasState.scale;

            const r = antipadDiameter / 2;

            if (isVert) {
                // Vertical orientation
                // Top cap
                ctx.arc(inst.x, inst.y + dy, r, 0, Math.PI, false);
                // Bottom cap
                ctx.arc(inst.x, inst.y - dy, r, Math.PI, 0, false);
            } else {
                // Horizontal orientation
                // Left cap
                ctx.arc(inst.x - dx, inst.y, r, Math.PI / 2, 3 * Math.PI / 2, false);
                // Right cap
                ctx.arc(inst.x + dx, inst.y, r, -Math.PI / 2, Math.PI / 2, false);
            }

            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        drawVia(inst.x - dx, inst.y - dy, diameter, color, p.holeDiameter, inst.properties.arrowDirection, 0);
        drawVia(inst.x + dx, inst.y + dy, diameter, color, p.holeDiameter, inst.properties.arrowDirection, 0);

        // Link line
        ctx.beginPath();
        ctx.strokeStyle = '#666';
        ctx.setLineDash([0.5, 0.5]);
        ctx.lineWidth = 0.5 / canvasState.scale;
        ctx.moveTo(inst.x - dx, inst.y - dy);
        ctx.lineTo(inst.x + dx, inst.y + dy);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawVia(x, y, diameter, color, holeDiameter, arrowDirection, antipadDiameter) {
    // Antipad (Dashed Circle)
    if (antipadDiameter && antipadDiameter > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#aaa';
        ctx.setLineDash([4, 2]); // Dashed
        ctx.lineWidth = 1 / canvasState.scale;
        ctx.arc(x, y, antipadDiameter / 2, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    // Pad
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, diameter / 2, 0, 2 * Math.PI);
    ctx.fill();

    // Hole
    if (holeDiameter) {
        ctx.beginPath();
        ctx.fillStyle = '#000';
        ctx.arc(x, y, holeDiameter / 2, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Arrow
    if (typeof arrowDirection !== 'undefined' && arrowDirection !== null) {
        ctx.save();
        ctx.translate(x, y);
        // Rotate: 0=Up, 1=Right, 2=Down, 3=Left
        ctx.rotate(-arrowDirection * Math.PI / 2);

        const r = diameter / 2;

        // Draw a filled block arrow
        ctx.beginPath();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = r * 0.05; // Small stroke to round corners
        ctx.lineJoin = 'round';

        // Arrow dimensions relative to radius
        const tipY = r * 0.5;
        const baseY = -r * 0.5;
        const headWidth = r * 0.6;
        const shaftWidth = r * 0.25;
        const headLength = r * 0.45;
        const shaftTop = tipY - headLength;

        // Tip
        ctx.moveTo(0, tipY);
        // Head Right
        ctx.lineTo(headWidth / 2, shaftTop);
        // Shaft Right Top
        ctx.lineTo(shaftWidth / 2, shaftTop);
        // Shaft Right Bottom
        ctx.lineTo(shaftWidth / 2, baseY);
        // Shaft Left Bottom
        ctx.lineTo(-shaftWidth / 2, baseY);
        // Shaft Left Top
        ctx.lineTo(-shaftWidth / 2, shaftTop);
        // Head Left
        ctx.lineTo(-headWidth / 2, shaftTop);

        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

function handleCanvasMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - canvasState.offsetX) / canvasState.scale;
    const mouseY = -(e.clientY - rect.top - canvasState.offsetY) / canvasState.scale;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Pan
        canvasState.isDragging = true;
        canvasState.dragType = 'pan';
        canvasState.lastX = e.clientX;
        canvasState.lastY = e.clientY;
        canvas.style.cursor = 'move';
    } else if (e.button === 0) {
        // Check selection
        const clickedId = checkSelection(mouseX, mouseY);
        if (clickedId) {
            selectInstance(clickedId);
            // Start dragging instance
            canvasState.isDragging = true;
            canvasState.dragType = 'move';
            canvasState.dragInstanceId = clickedId;
            canvas.style.cursor = 'grabbing';
        } else {
            // Place new
            if (padstacks.length === 0) {
                addMessage("No padstacks defined. Please create a padstack first.");
                return;
            }
            placeInstance(mouseX, mouseY);
        }
    }
}

function handleCanvasMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - canvasState.offsetX) / canvasState.scale;
    const mouseY = -(e.clientY - rect.top - canvasState.offsetY) / canvasState.scale;

    if (canvasState.isDragging) {
        if (canvasState.dragType === 'pan') {
            const dx = e.clientX - canvasState.lastX;
            const dy = e.clientY - canvasState.lastY;
            canvasState.offsetX += dx;
            canvasState.offsetY += dy;
            canvasState.lastX = e.clientX;
            canvasState.lastY = e.clientY;
            drawPlacementCanvas();
        } else if (canvasState.dragType === 'move') {
            const inst = placedInstances.find(i => i.id === canvasState.dragInstanceId);
            if (inst) {
                // Snap to grid
                const snap = canvasState.gridSpacing;
                inst.x = Math.round(mouseX / snap) * snap;
                inst.y = Math.round(mouseY / snap) * snap;
                drawPlacementCanvas();
                renderPropertiesPanel(); // Update coordinates in panel
            }
        }
    } else {
        // Hover effect
        const hoveredId = checkSelection(mouseX, mouseY);
        if (hoveredId) {
            canvas.style.cursor = 'grab'; // Hand shape indicating movable
        } else {
            canvas.style.cursor = 'crosshair'; // Indicating placement mode
        }
    }
}

function handleCanvasMouseUp(e) {
    if (canvasState.dragType === 'move') {
        renderPlacedList(); // Update list coordinates after drop
    }
    canvasState.isDragging = false;
    canvasState.dragType = null;
    canvasState.dragInstanceId = null;

    // Reset cursor based on position
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - canvasState.offsetX) / canvasState.scale;
    const mouseY = -(e.clientY - rect.top - canvasState.offsetY) / canvasState.scale;
    const hoveredId = checkSelection(mouseX, mouseY);
    canvas.style.cursor = hoveredId ? 'grab' : 'crosshair';
}

function handleCanvasDoubleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - canvasState.offsetX) / canvasState.scale;
    const mouseY = -(e.clientY - rect.top - canvasState.offsetY) / canvasState.scale;

    const clickedId = checkSelection(mouseX, mouseY);
    if (clickedId) {
        const inst = placedInstances.find(i => i.id === clickedId);
        if (inst) {
            if (inst.type === 'single') {
                if (typeof inst.properties.arrowDirection === 'undefined') {
                    inst.properties.arrowDirection = 0;
                }
                // Rotate clockwise
                inst.properties.arrowDirection = (inst.properties.arrowDirection + 1) % 4;
                drawPlacementCanvas();
            } else if (inst.type === 'differential') {
                if (typeof inst.properties.arrowDirection === 'undefined') {
                    inst.properties.arrowDirection = (inst.properties.orientation === 'vertical') ? 1 : 0;
                }

                // Toggle between perpendicular directions
                // Horizontal pair (link horizontal) -> Up(0) / Down(2)
                // Vertical pair (link vertical) -> Right(1) / Left(3)
                if (inst.properties.orientation === 'vertical') {
                    inst.properties.arrowDirection = (inst.properties.arrowDirection === 1) ? 3 : 1;
                } else {
                    inst.properties.arrowDirection = (inst.properties.arrowDirection === 0) ? 2 : 0;
                }
                drawPlacementCanvas();
            }
        }
    }
}

function handleCanvasWheel(e) {
    e.preventDefault();
    const scaleFactor = 1.1;
    if (e.deltaY < 0) {
        canvasState.scale *= scaleFactor;
    } else {
        canvasState.scale /= scaleFactor;
    }
    drawPlacementCanvas();
}

function checkSelection(x, y) {
    // Hit testing with actual pad size
    for (let i = placedInstances.length - 1; i >= 0; i--) {
        const inst = placedInstances[i];

        // Determine radius
        let radius = 0.5; // Default fallback
        const pIndex = inst.padstackIndex;
        if (pIndex >= 0 && pIndex < padstacks.length) {
            const p = padstacks[pIndex];
            let maxD = p.padSize || p.holeDiameter || 0;
            if (maxD > 0) radius = maxD / 2;
        }

        if (inst.type === 'differential') {
            const pitch = inst.properties.pitch || 1.0;
            const isVert = inst.properties.orientation === 'vertical';
            const dx = isVert ? 0 : pitch / 2;
            const dy = isVert ? pitch / 2 : 0;

            const x1 = inst.x - dx;
            const y1 = inst.y - dy;
            const x2 = inst.x + dx;
            const y2 = inst.y + dy;

            // Check via 1
            if (Math.sqrt((x1 - x) ** 2 + (y1 - y) ** 2) <= radius) return inst.id;
            // Check via 2
            if (Math.sqrt((x2 - x) ** 2 + (y2 - y) ** 2) <= radius) return inst.id;

            // Check link line (with some tolerance, e.g., radius or fixed width)
            const distSq = distToSegmentSquared({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 });
            if (distSq <= radius * radius) return inst.id;

        } else {
            const dist = Math.sqrt((inst.x - x) ** 2 + (inst.y - y) ** 2);
            if (dist <= radius) return inst.id;
        }
    }
    return null;
}

function distToSegmentSquared(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
}

function placeInstance(x, y) {
    const padstackIndex = document.getElementById('placement-padstack-select').value;
    const nameInput = document.getElementById('placement-name');
    let name = nameInput ? nameInput.value.trim() : "";

    // Generate default name if empty
    if (!name) {
        const prefix = placementMode === 'differential' ? 'DiffPair' : (placementMode === 'gnd' ? 'GND' : 'Via');
        let count = 1;
        while (placedInstances.some(i => i.name === `${prefix}_${count}`)) {
            count++;
        }
        name = `${prefix}_${count}`;
    }

    // Check uniqueness
    if (placedInstances.some(i => i.name === name)) {
        addMessage(`Error: Name "${name}" already exists. Please choose a unique name.`);
        alert(`Error: Name "${name}" already exists. Please choose a unique name.`);
        return;
    }

    // Snap to grid
    const snap = canvasState.gridSpacing;
    const snappedX = Math.round(x / snap) * snap;
    const snappedY = Math.round(y / snap) * snap;

    const newInst = {
        id: Date.now(),
        name: name,
        type: placementMode,
        x: snappedX,
        y: snappedY,
        padstackIndex: parseInt(padstackIndex),
        properties: {}
    };

    if (placementMode === 'differential') {
        newInst.properties.pitch = parseFloat(document.getElementById('diff-pitch').value);
        const orient = document.querySelector('input[name="diff-orient"]:checked').value;
        newInst.properties.orientation = orient;
        // Default arrow: Vertical pair -> Right(1), Horizontal pair -> Up(0)
        newInst.properties.arrowDirection = (orient === 'vertical') ? 1 : 0;
        newInst.properties.feedIn = "";
        newInst.properties.feedInWidth = 5;
        newInst.properties.feedInSpacing = 5;
        newInst.properties.feedOut = "";
        newInst.properties.feedOutWidth = 5;
        newInst.properties.feedOutSpacing = 5;
    } else if (placementMode === 'single') {
        newInst.properties.arrowDirection = 0; // Default Up
        newInst.properties.feedIn = "";
        newInst.properties.feedInWidth = 15;
        newInst.properties.feedOut = "";
        newInst.properties.feedOutWidth = 15;
    }

    placedInstances.push(newInst);
    selectInstance(newInst.id);
}

function selectInstance(id) {
    selectedInstanceId = id;
    drawPlacementCanvas();
    renderPlacedList();
    renderPropertiesPanel();
}

function renderPlacedList() {
    const list = document.getElementById('placed-list');
    list.innerHTML = '';
    placedInstances.forEach(inst => {
        const li = document.createElement('li');
        const pName = padstacks[inst.padstackIndex]?.name || 'Unknown';
        li.textContent = `${inst.name || inst.type} (${pName}) @ [${inst.x}, ${inst.y}]`;
        if (inst.id === selectedInstanceId) li.classList.add('active');
        li.onclick = () => selectInstance(inst.id);
        list.appendChild(li);
    });
}

function renderPropertiesPanel() {
    const panel = document.getElementById('prop-panel-content');
    if (!selectedInstanceId) {
        panel.innerHTML = '<p class="hint">Select an instance to view properties.</p>';
        return;
    }

    const inst = placedInstances.find(i => i.id === selectedInstanceId);
    if (!inst) return;

    let html = `
        <div class="form-group">
            <label>Name:</label>
            <input type="text" value="${inst.name || ''}" onchange="updateInstanceProp(${inst.id}, 'name', this.value)">
        </div>
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>X:</label>
                <input type="number" value="${inst.x}" oninput="updateInstanceProp(${inst.id}, 'x', this.value)" style="width: 50%;">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Y:</label>
                <input type="number" value="${inst.y}" oninput="updateInstanceProp(${inst.id}, 'y', this.value)" style="width: 50%;">
            </div>
        </div>
    `;

    if (inst.type === 'differential') {
        const conductorLayers = currentStackup.filter(l => l.type === 'Conductor');
        const createLayerSelectWithWidthAndSpacing = (prop, label, widthProp, spacingProp) => {
            const val = inst.properties[prop] || "";
            const widthVal = inst.properties[widthProp] !== undefined ? inst.properties[widthProp] : 5;
            const spacingVal = inst.properties[spacingProp] !== undefined ? inst.properties[spacingProp] : 5;
            const opts = conductorLayers.map(l => `<option value="${l.name}" ${l.name === val ? 'selected' : ''} ${l.isReference ? 'disabled' : ''}>${l.name}</option>`).join('');
            return `
               <div class="form-group">
                   <label>${label}:</label>
                   <select onchange="updateInstanceProp(${inst.id}, '${prop}', this.value)">
                       <option value="">-- Select --</option>
                       ${opts}
                   </select>
               </div>
               <div style="display: flex; gap: 10px;">
                   <div class="form-group" style="flex: 1;">
                       <label>Width:</label>
                       <input type="number" value="${widthVal}" oninput="updateInstanceProp(${inst.id}, '${widthProp}', this.value)" style="width: 60px;">
                   </div>
                   <div class="form-group" style="flex: 1;">
                       <label>Spacing:</label>
                       <input type="number" value="${spacingVal}" oninput="updateInstanceProp(${inst.id}, '${spacingProp}', this.value)" style="width: 60px;">
                   </div>
               </div>
            `;
        };

        html += `
            <div class="form-group">
                <label>Pitch:</label>
                <input type="number" value="${inst.properties.pitch}" oninput="updateInstanceProp(${inst.id}, 'pitch', this.value)">
            </div>
            <div class="form-group">
                <label>Orientation:</label>
                <select onchange="updateInstanceProp(${inst.id}, 'orientation', this.value)">
                    <option value="horizontal" ${inst.properties.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    <option value="vertical" ${inst.properties.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
                </select>
            </div>
            ${createLayerSelectWithWidthAndSpacing('feedIn', 'Feed In', 'feedInWidth', 'feedInSpacing')}
            ${createLayerSelectWithWidthAndSpacing('feedOut', 'Feed Out', 'feedOutWidth', 'feedOutSpacing')}
        `;
    } else if (inst.type === 'single') {
        const conductorLayers = currentStackup.filter(l => l.type === 'Conductor');
        const createLayerSelectWithWidth = (prop, label, widthProp) => {
            const val = inst.properties[prop] || "";
            const widthVal = inst.properties[widthProp] !== undefined ? inst.properties[widthProp] : 15;
            const opts = conductorLayers.map(l => `<option value="${l.name}" ${l.name === val ? 'selected' : ''} ${l.isReference ? 'disabled' : ''}>${l.name}</option>`).join('');
            return `
               <div class="form-group">
                   <label>${label}:</label>
                   <select onchange="updateInstanceProp(${inst.id}, '${prop}', this.value)">
                       <option value="">-- Select --</option>
                       ${opts}
                   </select>
               </div>
               <div class="form-group">
                   <label>${label} Width:</label>
                   <input type="number" value="${widthVal}" oninput="updateInstanceProp(${inst.id}, '${widthProp}', this.value)">
               </div>
            `;
        };

        html += `
            ${createLayerSelectWithWidth('feedIn', 'Feed In', 'feedInWidth')}
            ${createLayerSelectWithWidth('feedOut', 'Feed Out', 'feedOutWidth')}
        `;
    }



    panel.innerHTML = html;
}

function updateInstanceProp(id, key, value) {
    const inst = placedInstances.find(i => i.id === id);
    if (!inst) return;

    if (key === 'name') {
        const newName = value.trim();
        if (!newName) {
            alert("Name cannot be empty.");
            // Revert value in input
            renderPropertiesPanel();
            return;
        }
        if (placedInstances.some(i => i.id !== id && i.name === newName)) {
            alert(`Name "${newName}" already exists.`);
            // Revert value in input
            renderPropertiesPanel();
            return;
        }
        inst.name = newName;
    } else if (key === 'x' || key === 'y') {
        inst[key] = parseFloat(value);
    } else {
        if (key === 'pitch' || key === 'width' || key === 'spacing' || key === 'feedInWidth' || key === 'feedOutWidth' || key === 'feedInSpacing' || key === 'feedOutSpacing') {
            inst.properties[key] = parseFloat(value);
        } else {
            inst.properties[key] = value;
        }

        // Reset arrow direction if orientation changes
        if (key === 'orientation') {
            inst.properties.arrowDirection = (value === 'vertical') ? 1 : 0;
        }
    }
    drawPlacementCanvas();
    renderPlacedList();
}

function deleteInstance(id) {
    placedInstances = placedInstances.filter(i => i.id !== id);
    selectedInstanceId = null;
    drawPlacementCanvas();
    renderPlacedList();
    renderPropertiesPanel();
}

function updateGrid() {
    const val = parseFloat(document.getElementById('grid-spacing').value);
    if (val > 0) {
        canvasState.gridSpacing = val;
        drawPlacementCanvas();
    }
}

function zoomCanvas(factor) {
    canvasState.scale *= factor;
    drawPlacementCanvas();
}

function fitCanvas() {
    if (placedInstances.length === 0) {
        // Default reset if empty
        canvasState.scale = 10;
        canvasState.offsetX = canvas.width / 2;
        canvasState.offsetY = canvas.height / 2;
        drawPlacementCanvas();
        return;
    }

    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    placedInstances.forEach(inst => {
        if (inst.x < minX) minX = inst.x;
        if (inst.x > maxX) maxX = inst.x;
        if (inst.y < minY) minY = inst.y;
        if (inst.y > maxY) maxY = inst.y;
    });

    // Add some padding (e.g., via radius)
    const padding = 20; // units
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;

    if (bboxWidth === 0 || bboxHeight === 0) {
        canvasState.scale = 10;
        canvasState.offsetX = canvas.width / 2 - minX * 10;
        canvasState.offsetY = canvas.height / 2 + minY * 10;
        drawPlacementCanvas();
        return;
    }

    // Calculate scale to fit
    // Target is 80% of canvas size
    const targetW = canvas.width * 0.8;
    const targetH = canvas.height * 0.8;

    const scaleX = targetW / bboxWidth;
    const scaleY = targetH / bboxHeight;
    const scale = Math.min(scaleX, scaleY);

    // Center point
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    canvasState.scale = scale;
    // Offset calculation:
    // ScreenX = offsetX + WorldX * scale
    // We want ScreenX = CanvasWidth/2 when WorldX = centerX
    // CanvasWidth/2 = offsetX + centerX * scale => offsetX = CanvasWidth/2 - centerX * scale
    canvasState.offsetX = canvas.width / 2 - centerX * scale;

    // ScreenY = offsetY - WorldY * scale (due to flipped Y)
    // We want ScreenY = CanvasHeight/2 when WorldY = centerY
    // CanvasHeight/2 = offsetY - centerY * scale => offsetY = CanvasHeight/2 + centerY * scale
    canvasState.offsetY = canvas.height / 2 + centerY * scale;

    drawPlacementCanvas();
}

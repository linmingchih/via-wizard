// Global state
let isMessageWindowVisible = true;
let currentStackup = [];
let currentUnits = 'mm';

// Debug Alert
// alert("App.js Loaded"); 

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
    // alert(`JS Error: ${message}`);
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
    // addMessage(`Rendering table with ${currentStackup.length} layers.`);
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
            // Keep isReference relevant for Conductor? Actually user said IsRef only for Conductor.
        } else {
            currentStackup[index].conductivity = "";
            currentStackup[index].isReference = false; // Clear reference if becoming dielectric
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

    // Simple parsing assumption: Tab separated
    // Expected order: Name, Type, Thickness, Dk, Df, Cond, Fill, IsRef

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

    // Calculate total thickness for scaling
    const totalThickness = currentStackup.reduce((sum, l) => sum + (l.thickness || 0), 0);
    if (totalThickness === 0) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const scaleY = (height - 20) / totalThickness; // Padding 10px
    const startY = 10;

    let currentY = startY;

    // Create SVG
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

        // Color based on type
        if (layer.type === 'Conductor') {
            rect.setAttribute("fill", "#b87333"); // Copper
        } else {
            rect.setAttribute("fill", "#4a6fa5"); // Dielectric
            rect.setAttribute("opacity", "0.5");
        }
        rect.setAttribute("stroke", "#666");
        rect.setAttribute("stroke-width", "1");

        // Tooltip
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

// Initialize
window.addEventListener('pywebviewready', function () {
    addMessage("Via Wizard GUI Initialized.");
});

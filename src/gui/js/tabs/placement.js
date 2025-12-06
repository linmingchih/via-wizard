
import { state } from '../state.js';
import { PlacementCanvas } from '../components/canvas.js';
import { addMessage, calculateFeedPaths } from '../utils.js';

let canvasInstance = null;
let clipboardInstance = null;

export function renderPlacementTab() {
    const padstackSelect = document.getElementById('placement-padstack-select');
    if (padstackSelect) {
        padstackSelect.innerHTML = '';
        state.padstacks.forEach((p, i) => {
            padstackSelect.add(new Option(p.name, i));
        });
    }

    updatePlacementMode();

    if (!canvasInstance) {
        canvasInstance = new PlacementCanvas('placement-canvas', 'canvas-wrapper', {
            onSelect: (id) => selectInstance(id),
            onPlace: (x, y) => placeInstance(x, y),
            onUpdate: () => {
                renderPlacedList();
                renderPropertiesPanel();
            }
        });
        // Expose draw method for other modules (like padstack updates)
        window.drawPlacementCanvas = () => canvasInstance.draw();
    } else {
        canvasInstance.resize();
        canvasInstance.draw();
    }

    renderPlacedList();

    // Attach event listeners for board size inputs
    const wInput = document.getElementById('canvas-width');
    const hInput = document.getElementById('canvas-height');
    const redraw = () => { if (canvasInstance) canvasInstance.draw(); };

    if (wInput) {
        wInput.oninput = redraw;
        wInput.onchange = redraw;
    }
    if (hInput) {
        hInput.oninput = redraw;
        hInput.onchange = redraw;
    }
}

// Global key listener for delete
// Global key listener for shortcuts
window.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    const placementTab = document.getElementById('tab-placement');
    if (!placementTab || !placementTab.classList.contains('active')) {
        return;
    }

    if (e.key === 'Delete' && state.selectedInstanceId) {
        deleteInstance(state.selectedInstanceId);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (state.selectedInstanceId) {
            copyInstance(state.selectedInstanceId);
        }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        pasteInstance();
    }
});

export function updatePlacementMode() {
    const radios = document.getElementsByName('place-type');
    radios.forEach(r => {
        if (r.checked) state.placementMode = r.value;
    });

    // const diffSettings = document.getElementById('diff-settings');
    // if (state.placementMode === 'differential') {
    //     diffSettings.classList.remove('hidden');
    // } else {
    //     diffSettings.classList.add('hidden');
    // }
}

export function placeInstance(x, y) {
    const padstackIndex = document.getElementById('placement-padstack-select').value;
    const nameInput = document.getElementById('placement-name');
    let name = nameInput ? nameInput.value.trim() : "";

    if (!name) {
        const prefix = (state.placementMode === 'differential' || state.placementMode === 'diff_gnd') ? 'DiffPair' : (state.placementMode === 'gnd' ? 'GND' : 'Via');
        let count = 1;
        while (state.placedInstances.some(i => i.name === `${prefix}_${count}`)) {
            count++;
        }
        name = `${prefix}_${count}`;
    }

    if (state.placedInstances.some(i => i.name === name)) {
        alert(`Error: Name "${name}" already exists. Please choose a unique name.`);
        return;
    }

    const snap = state.canvasState.gridSpacing;
    const snappedX = Math.round(x / snap) * snap;
    const snappedY = Math.round(y / snap) * snap;

    const newInst = {
        id: Date.now(),
        name: name,
        type: state.placementMode,
        x: snappedX,
        y: snappedY,
        padstackIndex: parseInt(padstackIndex),
        properties: {}
    };

    if (state.placementMode === 'differential' || state.placementMode === 'diff_gnd') {
        const pitchInput = document.getElementById('diff-pitch');
        newInst.properties.pitch = pitchInput ? parseFloat(pitchInput.value) : 40;

        const orientInput = document.querySelector('input[name="diff-orient"]:checked');
        const orient = orientInput ? orientInput.value : 'horizontal';
        newInst.properties.orientation = orient;
        newInst.properties.arrowDirection = (orient === 'vertical') ? 1 : 0;
        newInst.properties.feedIn = "";
        newInst.properties.feedInWidth = 5;
        newInst.properties.feedInSpacing = 5;
        newInst.properties.feedOut = "";
        newInst.properties.feedOutWidth = 5;
        newInst.properties.feedOutSpacing = 5;

        if (state.placementMode === 'diff_gnd') {
            newInst.properties.gndRadius = 15;
            newInst.properties.gndCount = 3;
            newInst.properties.gndAngleStep = 30;
            newInst.properties.gndPadstackIndex = parseInt(padstackIndex); // Default to same padstack
        }
    } else if (state.placementMode === 'single') {
        newInst.properties.arrowDirection = 0;
        newInst.properties.feedIn = "";
        newInst.properties.feedInWidth = 15;
        newInst.properties.feedOut = "";
        newInst.properties.feedOutWidth = 15;
    }

    state.placedInstances.push(newInst);
    selectInstance(newInst.id);
}

export function selectInstance(id) {
    state.selectedInstanceId = id;
    if (canvasInstance) canvasInstance.draw();
    renderPlacedList();
    renderPropertiesPanel();
}

export function renderPlacedList() {
    const list = document.getElementById('placed-list');
    if (!list) return;
    list.innerHTML = '';

    // Sort instances by name for display
    const sortedInstances = [...state.placedInstances].sort((a, b) => {
        const nameA = (a.name || a.type).toString();
        const nameB = (b.name || b.type).toString();
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedInstances.forEach(inst => {
        const li = document.createElement('li');
        const pName = state.padstacks[inst.padstackIndex]?.name || 'Unknown';
        li.textContent = `${inst.name || inst.type} (${pName}) @ [${inst.x}, ${inst.y}]`;
        if (inst.id === state.selectedInstanceId) li.classList.add('active');
        li.onclick = () => selectInstance(inst.id);
        list.appendChild(li);
    });
}

export function renderPropertiesPanel() {
    const panel = document.getElementById('prop-panel-content');
    if (!panel) return;

    if (!state.selectedInstanceId) {
        panel.innerHTML = '<p class="hint">Select an instance to view properties.</p>';
        return;
    }

    const inst = state.placedInstances.find(i => i.id === state.selectedInstanceId);
    if (!inst) return;

    let html = `<table class="prop-table">`;

    // Name
    html += `
        <tr>
            <td>Name</td>
            <td><input type="text" value="${inst.name || ''}" onchange="window.updateInstanceProp(${inst.id}, 'name', this.value)"></td>
        </tr>
    `;

    // Position (X, Y)
    html += `
        <tr>
            <td>Position (X, Y)</td>
            <td style="display: flex; gap: 5px;">
                <input type="number" value="${inst.x}" oninput="window.updateInstanceProp(${inst.id}, 'x', this.value)" title="X Coordinate">
                <input type="number" value="${inst.y}" oninput="window.updateInstanceProp(${inst.id}, 'y', this.value)" title="Y Coordinate">
            </td>
        </tr>
    `;

    if (inst.type === 'differential' || inst.type === 'diff_gnd') {
        const conductorLayers = state.currentStackup.filter(l => l.type === 'Conductor');

        // Helper for Layer Select
        const createLayerRow = (prop, label, rowClass = '') => {
            const val = inst.properties[prop] || "";
            const opts = conductorLayers.map(l => `<option value="${l.name}" ${l.name === val ? 'selected' : ''} ${l.isReference ? 'disabled' : ''}>${l.name}</option>`).join('');
            return `
                <tr class="${rowClass}">
                    <td>${label}</td>
                    <td>
                        <select onchange="window.updateInstanceProp(${inst.id}, '${prop}', this.value)">
                            <option value="">-- Select --</option>
                            ${opts}
                        </select>
                    </td>
                </tr>
            `;
        };

        // Helper for Width/Spacing Row
        const createWidthSpacingRow = (widthProp, spacingProp, labelPrefix, rowClass = '') => {
            const widthVal = inst.properties[widthProp] !== undefined ? inst.properties[widthProp] : 5;
            const spacingVal = inst.properties[spacingProp] !== undefined ? inst.properties[spacingProp] : 5;
            return `
                <tr class="${rowClass}">
                    <td>${labelPrefix} W/S</td>
                    <td style="display: flex; gap: 5px;">
                        <input type="number" value="${widthVal}" oninput="window.updateInstanceProp(${inst.id}, '${widthProp}', this.value)" title="Width">
                        <input type="number" value="${spacingVal}" oninput="window.updateInstanceProp(${inst.id}, '${spacingProp}', this.value)" title="Spacing">
                    </td>
                </tr>
            `;
        };

        // Pitch
        html += `
            <tr>
                <td>Pitch</td>
                <td><input type="number" value="${inst.properties.pitch}" oninput="window.updateInstanceProp(${inst.id}, 'pitch', this.value)"></td>
            </tr>
        `;

        // Orientation
        html += `
            <tr>
                <td>Orientation</td>
                <td>
                    <select onchange="window.updateInstanceProp(${inst.id}, 'orientation', this.value)">
                        <option value="horizontal" ${inst.properties.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                        <option value="vertical" ${inst.properties.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
                    </select>
                </td>
            </tr>
        `;

        // Feed In Geometry
        html += `
            <tr onclick="window.togglePropSection('feed-in-rows', this)" style="cursor:pointer; user-select:none;">
                <td colspan="2" style="background:#444; font-weight:bold; font-size:0.9em;">
                    <span class="toggle-icon">▼</span> Feed In Geometry
                </td>
            </tr>
        `;
        html += createLayerRow('feedIn', 'Feed In Layer', 'feed-in-rows');
        html += createWidthSpacingRow('feedInWidth', 'feedInSpacing', 'Feed In', 'feed-in-rows');
        html += `
            <tr class="feed-in-rows">
                <td>d1 (Straight)</td>
                <td><input type="number" value="${inst.properties.feedInD1 || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedInD1', this.value)"></td>
            </tr>
            <tr class="feed-in-rows">
                <td>Turn Deg</td>
                <td><input type="number" value="${inst.properties.feedInAlpha || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedInAlpha', this.value)"></td>
            </tr>
            <tr class="feed-in-rows">
                <td>Radius (R)</td>
                <td><input type="number" value="${inst.properties.feedInR || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedInR', this.value)"></td>
            </tr>
            <tr class="feed-in-rows">
                <td>d2 (End Len)</td>
                <td><input type="number" placeholder="Auto" value="${inst.properties.feedInD2 !== undefined ? inst.properties.feedInD2 : ''}" oninput="window.updateInstanceProp(${inst.id}, 'feedInD2', this.value)"></td>
            </tr>
        `;

        // Feed Out Geometry
        html += `
            <tr onclick="window.togglePropSection('feed-out-rows', this)" style="cursor:pointer; user-select:none;">
                <td colspan="2" style="background:#444; font-weight:bold; font-size:0.9em;">
                    <span class="toggle-icon">▼</span> Feed Out Geometry
                </td>
            </tr>
        `;
        html += createLayerRow('feedOut', 'Feed Out Layer', 'feed-out-rows');
        html += createWidthSpacingRow('feedOutWidth', 'feedOutSpacing', 'Feed Out', 'feed-out-rows');
        html += `
            <tr class="feed-out-rows">
                <td>d1 (Straight)</td>
                <td><input type="number" value="${inst.properties.feedOutD1 || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutD1', this.value)"></td>
            </tr>
            <tr class="feed-out-rows">
                <td>Turn Deg</td>
                <td><input type="number" value="${inst.properties.feedOutAlpha || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutAlpha', this.value)"></td>
            </tr>
            <tr class="feed-out-rows">
                <td>Radius (R)</td>
                <td><input type="number" value="${inst.properties.feedOutR || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutR', this.value)"></td>
            </tr>
            <tr class="feed-out-rows">
                <td>d2 (End Len)</td>
                <td><input type="number" placeholder="Auto" value="${inst.properties.feedOutD2 !== undefined ? inst.properties.feedOutD2 : ''}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutD2', this.value)"></td>
            </tr>
        `;

        if (inst.type === 'diff_gnd') {
            // GND Settings
            html += `
                <tr onclick="window.togglePropSection('gnd-rows', this)" style="cursor:pointer; user-select:none;">
                    <td colspan="2" style="background:#333; font-weight:bold;">
                        <span class="toggle-icon">▼</span> GND Via Settings
                    </td>
                </tr>
                <tr class="gnd-rows">
                    <td>GND Radius</td>
                    <td><input type="number" value="${inst.properties.gndRadius}" oninput="window.updateInstanceProp(${inst.id}, 'gndRadius', this.value)"></td>
                </tr>
                <tr class="gnd-rows">
                    <td>GND Count</td>
                    <td><input type="number" value="${inst.properties.gndCount}" step="1" oninput="window.updateInstanceProp(${inst.id}, 'gndCount', this.value)"></td>
                </tr>
                <tr class="gnd-rows">
                    <td>Angle Step (deg)</td>
                    <td><input type="number" value="${inst.properties.gndAngleStep}" oninput="window.updateInstanceProp(${inst.id}, 'gndAngleStep', this.value)"></td>
                </tr>
            `;

            // GND Padstack Selector
            const padstackOpts = state.padstacks.map((p, i) =>
                `<option value="${i}" ${i === inst.properties.gndPadstackIndex ? 'selected' : ''}>${p.name}</option>`
            ).join('');

            html += `
                <tr class="gnd-rows">
                    <td>GND Padstack</td>
                    <td>
                        <select onchange="window.updateInstanceProp(${inst.id}, 'gndPadstackIndex', this.value)">
                            ${padstackOpts}
                        </select>
                    </td>
                </tr>
            `;
        }

    } else if (inst.type === 'single') {
        const conductorLayers = state.currentStackup.filter(l => l.type === 'Conductor');

        const createLayerRow = (prop, label) => {
            const val = inst.properties[prop] || "";
            const opts = conductorLayers.map(l => `<option value="${l.name}" ${l.name === val ? 'selected' : ''} ${l.isReference ? 'disabled' : ''}>${l.name}</option>`).join('');
            return `
                <tr>
                    <td>${label}</td>
                    <td>
                        <select onchange="window.updateInstanceProp(${inst.id}, '${prop}', this.value)">
                            <option value="">-- Select --</option>
                            ${opts}
                        </select>
                    </td>
                </tr>
            `;
        };

        const createWidthRow = (widthProp, label) => {
            const widthVal = inst.properties[widthProp] !== undefined ? inst.properties[widthProp] : 15;
            return `
                <tr>
                    <td>${label}</td>
                    <td><input type="number" value="${widthVal}" oninput="window.updateInstanceProp(${inst.id}, '${widthProp}', this.value)"></td>
                </tr>
             `;
        };

        html += createLayerRow('feedIn', 'Feed In Layer');
        html += createWidthRow('feedInWidth', 'Feed In Width');
        html += createLayerRow('feedOut', 'Feed Out Layer');
        html += createWidthRow('feedOutWidth', 'Feed Out Width');
    }

    html += `</table>`;

    html += `
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="window.deleteInstance(${inst.id})" style="background-color: #d9534f; color: white; border: none; padding: 5px 10px; cursor: pointer;">Delete Instance</button>
        </div>
    `;

    panel.innerHTML = html;
}
export function updateInstanceProp(id, key, value) {
    const inst = state.placedInstances.find(i => i.id === id);
    if (!inst) return;

    if (key === 'name') {
        const newName = value.trim();
        if (!newName) {
            alert("Name cannot be empty.");
            renderPropertiesPanel();
            return;
        }
        if (state.placedInstances.some(i => i.id !== id && i.name === newName)) {
            alert(`Name "${newName}" already exists.`);
            renderPropertiesPanel();
            return;
        }
        inst.name = newName;
    } else if (key === 'x' || key === 'y') {
        inst[key] = parseFloat(value);
    } else {
        if (key === 'pitch' || key === 'width' || key === 'spacing' || key === 'feedInWidth' || key === 'feedOutWidth' || key === 'feedInSpacing' || key === 'feedOutSpacing' || key === 'gndRadius' || key === 'gndCount' || key === 'gndAngleStep' || key === 'feedInD1' || key === 'feedInAlpha' || key === 'feedInR' || key === 'feedOutD1' || key === 'feedOutAlpha' || key === 'feedOutR') {
            inst.properties[key] = parseFloat(value);
        } else if (key === 'feedInD2' || key === 'feedOutD2') {
            // Allow empty string for "Auto"
            inst.properties[key] = value === "" ? undefined : parseFloat(value);
        } else if (key === 'gndPadstackIndex') {
            inst.properties[key] = parseInt(value);
        } else {
            inst.properties[key] = value;
        }

        if (key === 'orientation') {
            inst.properties.arrowDirection = (value === 'vertical') ? 1 : 0;
        }
    }
    if (canvasInstance) canvasInstance.draw();
    renderPlacedList();
}

export function deleteInstance(id) {
    state.placedInstances = state.placedInstances.filter(i => i.id !== id);
    state.selectedInstanceId = null;
    if (canvasInstance) canvasInstance.draw();
    renderPlacedList();
    renderPropertiesPanel();
}

function copyInstance(id) {
    const inst = state.placedInstances.find(i => i.id === id);
    if (inst) {
        clipboardInstance = JSON.parse(JSON.stringify(inst));
        // console.log("Copied:", clipboardInstance);
    }
}

function pasteInstance() {
    if (!clipboardInstance) return;

    const newInst = JSON.parse(JSON.stringify(clipboardInstance));
    newInst.id = Date.now();

    // Generate unique name
    // Generate unique name
    let baseName = newInst.name;
    let newName;

    // Check if name ends with a number (e.g., "Via_1", "Name123")
    // Regex matches: (anything)(optional underscore)(number)$
    const match = baseName.match(/^(.*?)_?(\d+)$/);

    if (match) {
        // It has a number at the end
        const prefix = match[1];
        let num = parseInt(match[2], 10);

        // Try incrementing until unique
        do {
            num++;
            newName = `${prefix}_${num}`;
        } while (state.placedInstances.some(i => i.name === newName));
    } else {
        // No number at end, append _0
        let num = 0;
        newName = `${baseName}_${num}`;

        // If that exists, keep incrementing
        while (state.placedInstances.some(i => i.name === newName)) {
            num++;
            newName = `${baseName}_${num}`;
        }
    }
    newInst.name = newName;

    // Offset
    const offset = state.canvasState.gridSpacing || 10;
    newInst.x += offset;
    newInst.y += offset;

    state.placedInstances.push(newInst);
    selectInstance(newInst.id);
}

export function updateGrid() {
    const val = parseFloat(document.getElementById('grid-spacing').value);
    if (val > 0) {
        state.canvasState.gridSpacing = val;
        if (canvasInstance) canvasInstance.draw();
    }
}

export function fitCanvas() {
    if (state.placedInstances.length === 0) {
        state.canvasState.scale = 10;
        state.canvasState.offsetX = canvasInstance.canvas.width / 2;
        state.canvasState.offsetY = canvasInstance.canvas.height / 2;
        if (canvasInstance) canvasInstance.draw();
        return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    state.placedInstances.forEach(inst => {
        if (inst.x < minX) minX = inst.x;
        if (inst.x > maxX) maxX = inst.x;
        if (inst.y < minY) minY = inst.y;
        if (inst.y > maxY) maxY = inst.y;
    });

    const padding = 20;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;

    if (bboxWidth === 0 || bboxHeight === 0) {
        state.canvasState.scale = 10;
        state.canvasState.offsetX = canvasInstance.canvas.width / 2 - minX * 10;
        state.canvasState.offsetY = canvasInstance.canvas.height / 2 + minY * 10;
        if (canvasInstance) canvasInstance.draw();
        return;
    }

    const targetW = canvasInstance.canvas.width * 0.8;
    const targetH = canvasInstance.canvas.height * 0.8;

    const scaleX = targetW / bboxWidth;
    const scaleY = targetH / bboxHeight;
    const scale = Math.min(scaleX, scaleY);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    state.canvasState.scale = scale;
    state.canvasState.offsetX = canvasInstance.canvas.width / 2 - centerX * scale;
    state.canvasState.offsetY = canvasInstance.canvas.height / 2 + centerY * scale;

    if (canvasInstance) canvasInstance.draw();
}



window.togglePropSection = function (className, header) {
    const rows = document.querySelectorAll('.' + className);
    if (rows.length === 0) return;
    const isHidden = rows[0].style.display === 'none';
    rows.forEach(r => r.style.display = isHidden ? '' : 'none');
    const icon = header.querySelector('.toggle-icon');
    if (icon) icon.textContent = isHidden ? '▼' : '▶';
};

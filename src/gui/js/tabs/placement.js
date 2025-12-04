
import { state } from '../state.js';
import { PlacementCanvas } from '../components/canvas.js';
import { addMessage } from '../utils.js';

let canvasInstance = null;

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
window.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && state.selectedInstanceId) {
        // Only delete if we are in the placement tab (or it's active)
        const placementTab = document.getElementById('tab-placement');
        if (placementTab && placementTab.classList.contains('active')) {
            deleteInstance(state.selectedInstanceId);
        }
    }
});

export function updatePlacementMode() {
    const radios = document.getElementsByName('place-type');
    radios.forEach(r => {
        if (r.checked) state.placementMode = r.value;
    });

    const diffSettings = document.getElementById('diff-settings');
    if (state.placementMode === 'differential') {
        diffSettings.classList.remove('hidden');
    } else {
        diffSettings.classList.add('hidden');
    }
}

export function placeInstance(x, y) {
    const padstackIndex = document.getElementById('placement-padstack-select').value;
    const nameInput = document.getElementById('placement-name');
    let name = nameInput ? nameInput.value.trim() : "";

    if (!name) {
        const prefix = state.placementMode === 'differential' ? 'DiffPair' : (state.placementMode === 'gnd' ? 'GND' : 'Via');
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

    if (state.placementMode === 'differential') {
        newInst.properties.pitch = parseFloat(document.getElementById('diff-pitch').value);
        const orient = document.querySelector('input[name="diff-orient"]:checked').value;
        newInst.properties.orientation = orient;
        newInst.properties.arrowDirection = (orient === 'vertical') ? 1 : 0;
        newInst.properties.feedIn = "";
        newInst.properties.feedInWidth = 5;
        newInst.properties.feedInSpacing = 5;
        newInst.properties.feedOut = "";
        newInst.properties.feedOutWidth = 5;
        newInst.properties.feedOutSpacing = 5;
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

    if (inst.type === 'differential') {
        const conductorLayers = state.currentStackup.filter(l => l.type === 'Conductor');

        // Helper for Layer Select
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

        // Helper for Width/Spacing Row
        const createWidthSpacingRow = (widthProp, spacingProp, labelPrefix) => {
            const widthVal = inst.properties[widthProp] !== undefined ? inst.properties[widthProp] : 5;
            const spacingVal = inst.properties[spacingProp] !== undefined ? inst.properties[spacingProp] : 5;
            return `
                <tr>
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

        // Feed In
        html += createLayerRow('feedIn', 'Feed In Layer');
        html += createWidthSpacingRow('feedInWidth', 'feedInSpacing', 'Feed In');

        // Feed Out
        html += createLayerRow('feedOut', 'Feed Out Layer');
        html += createWidthSpacingRow('feedOutWidth', 'feedOutSpacing', 'Feed Out');

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
        if (key === 'pitch' || key === 'width' || key === 'spacing' || key === 'feedInWidth' || key === 'feedOutWidth' || key === 'feedInSpacing' || key === 'feedOutSpacing') {
            inst.properties[key] = parseFloat(value);
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

export function calculateFeedPaths(inst, boardW, boardH) {
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

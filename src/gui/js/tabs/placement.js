
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
    updateGrid();

    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper && wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
        if (!canvasInstance) {
            canvasInstance = new PlacementCanvas('placement-canvas', 'canvas-wrapper', {
                onSelect: (id) => selectInstance(id),
                onPlace: (x, y) => placeInstance(x, y),
                onUpdate: () => {
                    renderPlacedList();
                    renderPropertiesPanel();
                },
                onUpdateProp: (id, key, val) => updateInstanceProp(id, key, val)
            });
            // Expose draw method for other modules (like padstack updates)
            window.drawPlacementCanvas = () => canvasInstance.draw();
            fitCanvas();
        } else {
            canvasInstance.resize();
            canvasInstance.draw();
        }
    }

    renderPlacedList();
    initSplitter();

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
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();

        // Get sorted instances (same as renderPlacedList)
        const sortedInstances = [...state.placedInstances].sort((a, b) => {
            const nameA = (a.name || a.type).toString();
            const nameB = (b.name || b.type).toString();
            return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        });

        if (sortedInstances.length === 0) return;

        let newId = null;
        if (!state.selectedInstanceId) {
            // If nothing selected, select first
            newId = sortedInstances[0].id;
        } else {
            const idx = sortedInstances.findIndex(i => i.id === state.selectedInstanceId);
            if (idx === -1) {
                newId = sortedInstances[0].id;
            } else {
                if (e.key === 'ArrowUp') {
                    if (idx > 0) newId = sortedInstances[idx - 1].id;
                } else {
                    if (idx < sortedInstances.length - 1) newId = sortedInstances[idx + 1].id;
                }
            }
        }

        if (newId) {
            selectInstance(newId);
            // Scroll into view
            setTimeout(() => {
                const list = document.getElementById('placed-list');
                if (list) {
                    const activeItem = list.querySelector('.active');
                    if (activeItem) {
                        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            }, 0);
        }
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
        const prefix = (state.placementMode === 'differential' || state.placementMode === 'diff_gnd') ? 'DiffPair' : (state.placementMode === 'gnd' ? 'GND' : (state.placementMode === 'dog_bone' ? 'DogBone' : (state.placementMode === 'surround_via_array' ? 'SurroundVia' : 'Via')));
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
        newInst.properties.feedInPour = false;
        newInst.properties.feedInGap = 5;
        newInst.properties.feedOut = "";
        newInst.properties.feedOutWidth = 5;
        newInst.properties.feedOutSpacing = 5;
        newInst.properties.feedOutPour = false;
        newInst.properties.feedOutGap = 5;

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
        newInst.properties.feedInPour = false;
        newInst.properties.feedInGap = 5;
        newInst.properties.feedOut = "";
        newInst.properties.feedOutWidth = 15;
        newInst.properties.feedOutPour = false;
        newInst.properties.feedOutGap = 5;
    } else if (state.placementMode === 'dog_bone') {
        newInst.properties.connectedDiffPairId = null;
        newInst.properties.lineWidth = 5;
        newInst.properties.length = 20;
        newInst.properties.posAngle = 45;
        newInst.properties.negAngle = 135;
        newInst.properties.diameter = 10;
        newInst.properties.void = 0;
    } else if (state.placementMode === 'surround_via_array') {
        newInst.properties.connectedDiffPairId = null;
        newInst.properties.gndRadius = 15;
        newInst.properties.gndCount = 3;
        newInst.properties.gndAngleStep = 30;
        newInst.properties.gndPadstackIndex = parseInt(padstackIndex);
    } else if (state.placementMode === 'gnd') {
        newInst.properties.connectedDiffPairId = null;
        newInst.properties.relX = 0;
        newInst.properties.relY = 0;
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

    // 1. Separate independent and dependent instances
    const independent = [];
    const dependentMap = {}; // parentId (string) -> [children]

    state.placedInstances.forEach(inst => {
        const rawParentId = inst.properties.connectedDiffPairId;
        // Check if parent effectively exists
        const parentId = (rawParentId !== null && rawParentId !== undefined && rawParentId !== "") ? rawParentId.toString() : null;

        if (!parentId) {
            independent.push(inst);
        } else {
            if (!dependentMap[parentId]) dependentMap[parentId] = [];
            dependentMap[parentId].push(inst);
        }
    });

    // 2. Sort independent instances by name
    const sortByName = (a, b) => {
        const nameA = (a.name || a.type).toString();
        const nameB = (b.name || b.type).toString();
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    };
    independent.sort(sortByName);

    const processedIds = new Set();

    // 3. Helper to render an item and its children recursively
    const renderItem = (inst, level = 0) => {
        if (processedIds.has(inst.id)) return;
        processedIds.add(inst.id);

        const li = document.createElement('li');
        const pName = state.padstacks[inst.padstackIndex]?.name || 'Unknown';
        li.textContent = `${inst.name || inst.type} (${pName}) @ [${inst.x}, ${inst.y}]`;

        if (inst.id === state.selectedInstanceId) li.classList.add('active');
        if (level > 0) li.classList.add('indent-item');

        li.onclick = () => selectInstance(inst.id);
        list.appendChild(li);

        const children = dependentMap[inst.id.toString()];
        if (children) {
            children.sort(sortByName);
            children.forEach(child => renderItem(child, level + 1));
        }
    };

    // 4. Render independent items first
    independent.forEach(inst => renderItem(inst, 0));

    // 5. Handle Orphans (dependents whose parent is missing)
    state.placedInstances.forEach(inst => {
        if (!processedIds.has(inst.id)) {
            renderItem(inst, 1); // Render as orphan (indented)
        }
    });
}

export function renderPropertiesPanel() {
    const panel = document.getElementById('prop-panel-content');
    if (!panel) return;

    // --- Focus Persistence Start ---
    const activeId = document.activeElement ? document.activeElement.id : null;
    let cursorStart = null, cursorEnd = null;
    if (document.activeElement instanceof HTMLInputElement) {
        cursorStart = document.activeElement.selectionStart;
        cursorEnd = document.activeElement.selectionEnd;
    }

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
            <td><input id="prop-name-${inst.id}" type="text" value="${inst.name || ''}" onchange="window.updateInstanceProp(${inst.id}, 'name', this.value)"></td>
        </tr>
    `;

    const isConnectedGnd = (inst.type === 'gnd' && inst.properties.connectedDiffPairId);
    const isLocked = !!inst.properties.connectedDiffPairId && (inst.type === 'differential' || inst.type === 'diff_gnd');

    if (!isConnectedGnd) {
        html += `
            <tr>
                <td>Position (X, Y)</td>
                <td style="display: flex; gap: 5px;">
                    <input id="prop-x-${inst.id}" type="number" value="${inst.x}" ${isLocked ? 'disabled style="opacity:0.6"' : ''} oninput="window.updateInstanceProp(${inst.id}, 'x', this.value)" title="X Coordinate">
                    <input id="prop-y-${inst.id}" type="number" value="${inst.y}" ${isLocked ? 'disabled style="opacity:0.6"' : ''} oninput="window.updateInstanceProp(${inst.id}, 'y', this.value)" title="Y Coordinate">
                </td>
            </tr>
        `;
    }

    if (inst.type === 'differential' || inst.type === 'diff_gnd') {
        const conductorLayers = state.currentStackup.filter(l => l.type === 'Conductor');

        // Helper for Layer Select
        const createLayerRow = (prop, label, rowClass = '') => {
            const val = inst.properties[prop] || "";
            const opts = conductorLayers.map(l => {
                const colorStyle = l.isReference ? 'style="color: blue;"' : '';
                return `<option value="${l.name}" ${l.name === val ? 'selected' : ''} ${colorStyle}>${l.name}</option>`;
            }).join('');
            return `
                <tr class="${rowClass}">
                    <td>${label}</td>
                    <td>
                        <select id="prop-${prop}-${inst.id}" onchange="window.updateInstanceProp(${inst.id}, '${prop}', this.value)">
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
                        <input id="prop-${widthProp}-${inst.id}" type="number" value="${widthVal}" oninput="window.updateInstanceProp(${inst.id}, '${widthProp}', this.value)" title="Width">
                        <input id="prop-${spacingProp}-${inst.id}" type="number" value="${spacingVal}" oninput="window.updateInstanceProp(${inst.id}, '${spacingProp}', this.value)" title="Spacing">
                    </td>
                </tr>
            `;
        };

        // Helper for Gap Row
        const createGapRow = (gapProp, layerProp, rowClass = '') => {
            const layerName = inst.properties[layerProp];
            const layer = state.currentStackup.find(l => l.name === layerName);
            const isRef = layer ? layer.isReference : false;
            const isEnabled = isRef; // Only enable if reference layer, matching single logic (though visualization allows it if pour is true)
            // Actually, for visualization we removed isRef check, but for UI enabling, we should probably keep it consistent with "Pour" being auto-set by isRef.
            // But wait, if we want to allow pour on non-ref layers, we should enable it always?
            // The user said "on is_ref checked layer". So let's keep it enabled only if isRef for now to avoid confusion, or just enable it always.
            // Let's stick to isRef for enabling the input to guide the user.

            const gapVal = inst.properties[gapProp] !== undefined ? inst.properties[gapProp] : 5;
            return `
                <tr class="${rowClass}">
                    <td>Gap</td>
                    <td>
                        <input id="prop-${gapProp}-${inst.id}" type="number" value="${gapVal}" 
                            ${isEnabled ? '' : 'disabled'}
                            oninput="window.updateInstanceProp(${inst.id}, '${gapProp}', this.value)" title="Gap">
                    </td>
                </tr>
            `;
        };

        const isLocked = !!inst.properties.connectedDiffPairId && (inst.type === 'differential' || inst.type === 'diff_gnd');

        // Pitch
        html += `
            <tr>
                <td>Pitch</td>
                <td><input id="prop-pitch-${inst.id}" type="number" value="${inst.properties.pitch}" ${isLocked ? 'disabled style="opacity:0.6"' : ''} oninput="window.updateInstanceProp(${inst.id}, 'pitch', this.value)"></td>
            </tr>
        `;

        // Orientation
        html += `
            <tr>
                <td>Orientation</td>
                <td>
                    <select id="prop-orientation-${inst.id}" ${isLocked ? 'disabled style="opacity:0.6"' : ''} onchange="window.updateInstanceProp(${inst.id}, 'orientation', this.value)">
                        <option value="horizontal" ${inst.properties.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                        <option value="vertical" ${inst.properties.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
                    </select>
                </td>
            </tr>
        `;

        // Connect to (Submenu alternative in Prop Panel)
        const potentialParents = state.placedInstances.filter(i =>
            i.id !== inst.id && (i.type === 'differential' || i.type === 'diff_gnd')
        );
        const parentOpts = potentialParents.map(p => `<option value="${p.id}" ${p.id === inst.properties.connectedDiffPairId ? 'selected' : ''}>${p.name}</option>`).join('');

        html += `
            <tr>
                <td>Connect to</td>
                <td>
                    <select id="prop-connectedDiffPairId-${inst.id}" onchange="window.updateInstanceProp(${inst.id}, 'connectedDiffPairId', this.value)">
                        <option value="">-- Independent --</option>
                        ${parentOpts}
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
        html += createGapRow('feedInGap', 'feedIn', 'feed-in-rows');
        html += `
            <tr class="feed-in-rows">
                <td>d1 (Straight)</td>
                <td><input id="prop-feedInD1-${inst.id}" type="number" value="${inst.properties.feedInD1 || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedInD1', this.value)"></td>
            </tr>
            <tr class="feed-in-rows">
                <td>Turn Deg</td>
                <td><input id="prop-feedInAlpha-${inst.id}" type="number" value="${inst.properties.feedInAlpha || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedInAlpha', this.value)"></td>
            </tr>
            <tr class="feed-in-rows">
                <td>Radius (R)</td>
                <td><input id="prop-feedInR-${inst.id}" type="number" value="${inst.properties.feedInR || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedInR', this.value)"></td>
            </tr>
            <tr class="feed-in-rows">
                <td>d2 (End Len)</td>
                <td><input id="prop-feedInD2-${inst.id}" type="number" placeholder="Auto" value="${inst.properties.feedInD2 !== undefined ? inst.properties.feedInD2 : ''}" oninput="window.updateInstanceProp(${inst.id}, 'feedInD2', this.value)"></td>
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
        html += createGapRow('feedOutGap', 'feedOut', 'feed-out-rows');
        html += `
            <tr class="feed-out-rows">
                <td>d1 (Straight)</td>
                <td><input id="prop-feedOutD1-${inst.id}" type="number" value="${inst.properties.feedOutD1 || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutD1', this.value)"></td>
            </tr>
            <tr class="feed-out-rows">
                <td>Turn Deg</td>
                <td><input id="prop-feedOutAlpha-${inst.id}" type="number" value="${inst.properties.feedOutAlpha || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutAlpha', this.value)"></td>
            </tr>
            <tr class="feed-out-rows">
                <td>Radius (R)</td>
                <td><input id="prop-feedOutR-${inst.id}" type="number" value="${inst.properties.feedOutR || 0}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutR', this.value)"></td>
            </tr>
            <tr class="feed-out-rows">
                <td>d2 (End Len)</td>
                <td><input id="prop-feedOutD2-${inst.id}" type="number" placeholder="Auto" value="${inst.properties.feedOutD2 !== undefined ? inst.properties.feedOutD2 : ''}" oninput="window.updateInstanceProp(${inst.id}, 'feedOutD2', this.value)"></td>
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
                    <td><input id="prop-gndRadius-${inst.id}" type="number" value="${inst.properties.gndRadius}" oninput="window.updateInstanceProp(${inst.id}, 'gndRadius', this.value)"></td>
                </tr>
                <tr class="gnd-rows">
                    <td>GND Count</td>
                    <td><input id="prop-gndCount-${inst.id}" type="number" value="${inst.properties.gndCount}" step="1" oninput="window.updateInstanceProp(${inst.id}, 'gndCount', this.value)"></td>
                </tr>
                <tr class="gnd-rows">
                    <td>Angle Step (deg)</td>
                    <td><input id="prop-gndAngleStep-${inst.id}" type="number" value="${inst.properties.gndAngleStep}" oninput="window.updateInstanceProp(${inst.id}, 'gndAngleStep', this.value)"></td>
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
                        <select id="prop-gndPadstackIndex-${inst.id}" onchange="window.updateInstanceProp(${inst.id}, 'gndPadstackIndex', this.value)">
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
            const opts = conductorLayers.map(l => {
                const colorStyle = l.isReference ? 'style="color: blue;"' : '';
                return `<option value="${l.name}" ${l.name === val ? 'selected' : ''} ${colorStyle}>${l.name}</option>`;
            }).join('');
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
                    <td><input id="prop-${widthProp}-${inst.id}" type="number" value="${widthVal}" oninput="window.updateInstanceProp(${inst.id}, '${widthProp}', this.value)"></td>
                </tr>
             `;
        };

        const createPourGapRow = (pourProp, gapProp, layerProp) => {
            const layerName = inst.properties[layerProp];
            const layer = state.currentStackup.find(l => l.name === layerName);
            const isRef = layer ? layer.isReference : false;

            // Gap is enabled if it is a reference layer
            const isEnabled = isRef;
            const gapVal = inst.properties[gapProp] !== undefined ? inst.properties[gapProp] : 5;

            return `
                <tr>
                    <td>Gap</td>
                    <td style="display: flex; align-items: center; gap: 5px;">
                        <input id="prop-${gapProp}-${inst.id}" type="number" value="${gapVal}" style="width: 100%;"
                            ${isEnabled ? '' : 'disabled'}
                            oninput="window.updateInstanceProp(${inst.id}, '${gapProp}', this.value)" title="Gap (mil)">
                    </td>
                </tr>
            `;
        };

        html += createLayerRow('feedIn', 'Feed In Layer');
        html += createWidthRow('feedInWidth', 'Feed In Width');
        html += createPourGapRow('feedInPour', 'feedInGap', 'feedIn');

        html += createLayerRow('feedOut', 'Feed Out Layer');
        html += createWidthRow('feedOutWidth', 'Feed Out Width');
        html += createPourGapRow('feedOutPour', 'feedOutGap', 'feedOut');
    } else if (inst.type === 'gnd') {
        // Connected Parent (Diff Pair or Single)
        const potentialParents = state.placedInstances.filter(i =>
            ['differential', 'diff_gnd', 'single'].includes(i.type)
        );
        const parentOpts = potentialParents.map(p => `<option value="${p.id}" ${p.id === inst.properties.connectedDiffPairId ? 'selected' : ''}>${p.name}</option>`).join('');

        html += `
            <tr>
                <td>Connect to</td>
                <td>
                    <select id="prop-connectedDiffPairId-${inst.id}" onchange="window.updateInstanceProp(${inst.id}, 'connectedDiffPairId', this.value)">
                        <option value="">-- Independent --</option>
                        ${parentOpts}
                    </select>
                </td>
            </tr>
        `;

        if (inst.properties.connectedDiffPairId) {
            html += `
                <tr>
                    <td>Relative Pos (X, Y)</td>
                    <td style="display: flex; gap: 5px;">
                        <input id="prop-relX-${inst.id}" type="number" value="${inst.properties.relX !== undefined ? inst.properties.relX : 5}" oninput="window.updateInstanceProp(${inst.id}, 'relX', this.value)" title="Relative X">
                        <input id="prop-relY-${inst.id}" type="number" value="${inst.properties.relY !== undefined ? inst.properties.relY : 5}" oninput="window.updateInstanceProp(${inst.id}, 'relY', this.value)" title="Relative Y">
                    </td>
                </tr>
            `;
        }
    } else if (inst.type === 'dog_bone') {
        // Connected Parent (Diff Pair, Single, or GND)
        const potentialParents = state.placedInstances.filter(i =>
            ['differential', 'diff_gnd', 'single', 'gnd'].includes(i.type)
        );
        const parentOpts = potentialParents.map(p => `<option value="${p.id}" ${p.id === inst.properties.connectedDiffPairId ? 'selected' : ''}>${p.name}</option>`).join('');

        html += `
            <tr>
                <td>Connect to</td>
                <td>
                    <select onchange="window.updateInstanceProp(${inst.id}, 'connectedDiffPairId', this.value)">
                        <option value="">-- Select Instance --</option>
                        ${parentOpts}
                    </select>
                </td>
            </tr>
            <tr>
                <td>Line Width</td>
                <td><input id="prop-lineWidth-${inst.id}" type="number" value="${inst.properties.lineWidth}" oninput="window.updateInstanceProp(${inst.id}, 'lineWidth', this.value)"></td>
            </tr>
            <tr>
                <td>Length</td>
                <td><input id="prop-length-${inst.id}" type="number" value="${inst.properties.length}" oninput="window.updateInstanceProp(${inst.id}, 'length', this.value)"></td>
            </tr>

        `;

        // Determine parent type to decide on Angle inputs
        const parentId = inst.properties.connectedDiffPairId;
        const parent = state.placedInstances.find(i => i.id === parentId);
        const isSingleOrGnd = parent && (parent.type === 'single' || parent.type === 'gnd');

        if (isSingleOrGnd) {
            html += `
                <tr>
                    <td>Angle</td>
                    <td><input id="prop-angle-${inst.id}" type="number" value="${inst.properties.angle !== undefined ? inst.properties.angle : 45}" oninput="window.updateInstanceProp(${inst.id}, 'angle', this.value)"></td>
                </tr>
            `;
        } else {
            html += `
                <tr>
                    <td>Pos Angle</td>
                    <td><input id="prop-posAngle-${inst.id}" type="number" value="${inst.properties.posAngle}" oninput="window.updateInstanceProp(${inst.id}, 'posAngle', this.value)"></td>
                </tr>
                <tr>
                    <td>Neg Angle</td>
                    <td><input id="prop-negAngle-${inst.id}" type="number" value="${inst.properties.negAngle}" oninput="window.updateInstanceProp(${inst.id}, 'negAngle', this.value)"></td>
                </tr>
            `;
        }

        html += `
            <tr>
                <td>Diameter</td>
                <td><input id="prop-diameter-${inst.id}" type="number" value="${inst.properties.diameter}" oninput="window.updateInstanceProp(${inst.id}, 'diameter', this.value)"></td>
            </tr>
             <tr>
                <td>Void(mil)</td>
                <td><input id="prop-void-${inst.id}" type="number" min="0" value="${inst.properties.void}" oninput="window.updateInstanceProp(${inst.id}, 'void', this.value)"></td>
            </tr>
        `;
    } else if (inst.type === 'surround_via_array') {
        const potentialParents = state.placedInstances.filter(i =>
            i.id !== inst.id && (i.type === 'differential' || i.type === 'diff_gnd')
        );
        const parentOpts = potentialParents.map(p => `<option value="${p.id}" ${p.id === inst.properties.connectedDiffPairId ? 'selected' : ''}>${p.name}</option>`).join('');

        html += `
            <tr>
                <td>Connect to</td>
                <td>
                    <select onchange="window.updateInstanceProp(${inst.id}, 'connectedDiffPairId', this.value)">
                        <option value="">-- Select Instance --</option>
                        ${parentOpts}
                    </select>
                </td>
            </tr>
            <tr>
                <td>Radius</td>
                <td><input id="prop-gndRadius-${inst.id}" type="number" value="${inst.properties.gndRadius}" oninput="window.updateInstanceProp(${inst.id}, 'gndRadius', this.value)"></td>
            </tr>
            <tr>
                <td>Count</td>
                <td><input id="prop-gndCount-${inst.id}" type="number" value="${inst.properties.gndCount}" step="1" oninput="window.updateInstanceProp(${inst.id}, 'gndCount', this.value)"></td>
            </tr>
            <tr>
                <td>Angle Step</td>
                <td><input id="prop-gndAngleStep-${inst.id}" type="number" value="${inst.properties.gndAngleStep}" oninput="window.updateInstanceProp(${inst.id}, 'gndAngleStep', this.value)"></td>
            </tr>
        `;

        const padstackOpts = state.padstacks.map((p, i) =>
            `<option value="${i}" ${i === inst.properties.gndPadstackIndex ? 'selected' : ''}>${p.name}</option>`
        ).join('');

        html += `
                <tr class="gnd-rows">
                    <td>Padstack</td>
                    <td>
                        <select id="prop-gndPadstackIndex-${inst.id}" onchange="window.updateInstanceProp(${inst.id}, 'gndPadstackIndex', this.value)">
                            ${padstackOpts}
                        </select>
                    </td>
                </tr>
        `;
    }

    html += `</table>`;

    html += `
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="window.deleteInstance(${inst.id})" style="background-color: #d9534f; color: white; border: none; padding: 5px 10px; cursor: pointer;">Delete Instance</button>
        </div>
    `;

    panel.innerHTML = html;

    // --- Focus Persistence End ---
    if (activeId) {
        const el = document.getElementById(activeId);
        if (el) {
            el.focus();
            if (cursorStart !== null && el.setSelectionRange) {
                try { el.setSelectionRange(cursorStart, cursorEnd); } catch (e) { }
            }
        }
    }
}
export function updateInstanceProp(id, key, value) {
    const inst = state.placedInstances.find(i => i.id === id);
    if (!inst) return;

    // Handle name change
    if (key === 'name') {
        const newName = value.trim();
        if (!newName) {
            alert('Name cannot be empty.');
            renderPropertiesPanel();
            return;
        }
        if (state.placedInstances.some(i => i.id !== id && i.name === newName)) {
            alert(`Name "${newName}" already exists.`);
            renderPropertiesPanel();
            return;
        }
        inst.name = newName;
    }
    // Boolean pour properties
    else if (key === 'feedInPour' || key === 'feedOutPour') {
        inst.properties[key] = !!value;
    }
    // Gap numeric properties
    else if (key === 'feedInGap' || key === 'feedOutGap') {
        const val = parseFloat(value);
        if (!isNaN(val) && val >= 0) {
            inst.properties[key] = val;
        } else {
            renderPropertiesPanel();
            return;
        }
    }
    // Numeric properties (including widths, spacings, etc.)
    else if (['width', 'spacing', 'feedInWidth', 'feedOutWidth', 'feedInSpacing', 'feedOutSpacing', 'gndRadius', 'feedInD1', 'feedInR', 'feedOutD1', 'feedOutR', 'lineWidth', 'length', 'posAngle', 'negAngle', 'diameter', 'angle', 'feedInAlpha', 'feedOutAlpha', 'gndCount', 'gndAngleStep'].includes(key)) {
        const val = parseFloat(value);
        if (!isNaN(val)) {
            inst.properties[key] = val;
        } else {
            renderPropertiesPanel();
            return;
        }
    }
    // Optional D2 values
    else if (key === 'feedInD2' || key === 'feedOutD2') {
        if (value === '') {
            inst.properties[key] = undefined;
        } else {
            const val = parseFloat(value);
            if (val > 0) {
                inst.properties[key] = val;
            } else {
                renderPropertiesPanel();
                return;
            }
        }
    }
    // Padstack index
    else if (key === 'gndPadstackIndex') {
        inst.properties[key] = parseInt(value);
    }
    // Connected diff pair reference
    else if (key === 'connectedDiffPairId') {
        const idVal = value ? parseInt(value) : null;
        inst.properties[key] = idVal;
        if (idVal && (inst.type === 'differential' || inst.type === 'diff_gnd')) {
            syncConnectedProperties(inst, idVal);
            syncConnectedRecursive(inst.id);
        }
        if (inst.type === 'gnd' && idVal) {
            // Initialize relative position if not present
            if (inst.properties.relX === undefined) inst.properties.relX = 5;
            if (inst.properties.relY === undefined) inst.properties.relY = 5;
        }
    }
    // Relative position for GND
    else if (key === 'relX' || key === 'relY') {
        inst.properties[key] = parseFloat(value);
    }
    // Void clearance
    else if (key === 'void') {
        const val = parseFloat(value);
        if (!isNaN(val) && val >= 0) {
            inst.properties[key] = val;
        } else {
            renderPropertiesPanel();
            return;
        }
    }
    // Orientation handling
    else if (key === 'orientation') {
        inst.properties[key] = value;
        inst.properties.arrowDirection = (value === 'vertical') ? 1 : 0;
        syncConnectedRecursive(inst.id);
    }
    // Handle X or Y change (for parent sync)
    else if (key === 'x' || key === 'y') {
        inst[key] = parseFloat(value);
        syncConnectedRecursive(inst.id);
    }
    // Pitch sync
    else if (key === 'pitch') {
        inst.properties[key] = parseFloat(value);
        syncConnectedRecursive(inst.id);
    }
    // Feed In/Out Layer Change
    else if (key === 'feedIn' || key === 'feedOut') {
        inst.properties[key] = value;
        // Check if new layer is reference
        const layer = state.currentStackup.find(l => l.name === value);
        const isRef = layer ? layer.isReference : false;
        // Set pour property based on isRef
        inst.properties[key + 'Pour'] = isRef;
    }
    // Fallback for any other property
    else {
        inst.properties[key] = value;
    }

    if (canvasInstance) canvasInstance.draw();
    renderPlacedList();
    if (key === 'feedIn' || key === 'feedOut' || key === 'connectedDiffPairId' || key === 'pitch' || key === 'orientation' || key === 'x' || key === 'y') {
        renderPropertiesPanel();
    }
}

export function deleteInstance(id) {
    state.placedInstances = state.placedInstances.filter(i => i.id !== id);
    state.selectedInstanceId = null;
    if (canvasInstance) canvasInstance.draw();
    renderPlacedList();
    renderPropertiesPanel();
}

function getAllDescendants(parentId) {
    let descendants = [];
    const children = state.placedInstances.filter(i => i.properties.connectedDiffPairId === parentId);
    children.forEach(child => {
        descendants.push(child);
        descendants = descendants.concat(getAllDescendants(child.id));
    });
    return descendants;
}

function copyInstance(id) {
    const inst = state.placedInstances.find(i => i.id === id);
    if (!inst) return;

    // Recursive search for ALL connected descendants
    const itemsToCopy = [inst, ...getAllDescendants(inst.id)];

    clipboardInstance = JSON.parse(JSON.stringify(itemsToCopy));
    addMessage(`Copied ${itemsToCopy.length} items to clipboard.`, 'info');
}

function pasteInstance() {
    if (!clipboardInstance || clipboardInstance.length === 0) return;

    const items = Array.isArray(clipboardInstance) ? clipboardInstance : [clipboardInstance];
    const idMap = new Map();
    const newItems = [];
    const offset = state.canvasState.gridSpacing || 10;
    const now = Date.now();

    // First pass: Create new instances with new IDs and unique names
    items.forEach((item, index) => {
        const newItem = JSON.parse(JSON.stringify(item));
        const oldId = newItem.id;

        // Ensure strictly unique ID
        newItem.id = now + index + Math.floor(Math.random() * 10000);
        idMap.set(oldId, newItem.id);

        // Name generation logic
        let baseName = newItem.name;
        let newName;
        const match = baseName.match(/^(.*?)_?(\d+)$/);

        const isNameTaken = (name) => {
            return state.placedInstances.some(i => i.name === name) || newItems.some(i => i.name === name);
        };

        if (match) {
            const prefix = match[1];
            let num = parseInt(match[2], 10);
            do {
                num++;
                newName = `${prefix}_${num}`;
            } while (isNameTaken(newName));
        } else {
            let num = 1;
            do {
                newName = `${baseName}_${num}`;
                num++;
            } while (isNameTaken(newName));
        }
        newItem.name = newName;

        // Apply spatial offset
        newItem.x += offset;
        newItem.y += offset;

        newItems.push(newItem);
    });

    // Second pass: Re-map internal connection references within the copied group
    newItems.forEach(newItem => {
        if (newItem.properties.connectedDiffPairId) {
            const newParentId = idMap.get(newItem.properties.connectedDiffPairId);
            if (newParentId) {
                newItem.properties.connectedDiffPairId = newParentId;
            } else {
                // If the parent wasn't part of the copied group, break the connection 
                // to avoid pointing to a random instance in the original group
                newItem.properties.connectedDiffPairId = null;
            }
        }
    });

    state.placedInstances.push(...newItems);

    if (canvasInstance) canvasInstance.draw();
    renderPlacedList();

    // Select the "root" of the pasted group (usually the first selected item)
    if (newItems.length > 0) {
        selectInstance(newItems[0].id);
    }

    addMessage(`Pasted ${newItems.length} items.`, 'success');
}

export function updateGrid() {
    const val = parseFloat(document.getElementById('grid-spacing').value);
    if (Number.isInteger(val) && val >= 1) {
        state.canvasState.gridSpacing = val;
        if (canvasInstance) canvasInstance.draw();
    }
}

export function fitCanvas() {
    const boardW = parseFloat(document.getElementById('canvas-width')?.value) || 0;
    const boardH = parseFloat(document.getElementById('canvas-height')?.value) || 0;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // Include Board
    if (boardW > 0 && boardH > 0) {
        minX = -boardW / 2;
        maxX = boardW / 2;
        minY = -boardH / 2;
        maxY = boardH / 2;
    }

    // Include Instances
    if (state.placedInstances.length > 0) {
        state.placedInstances.forEach(inst => {
            if (inst.x < minX) minX = inst.x;
            if (inst.x > maxX) maxX = inst.x;
            if (inst.y < minY) minY = inst.y;
            if (inst.y > maxY) maxY = inst.y;
        });
    } else if (minX === Infinity) {
        // No board and no instances
        state.canvasState.scale = 10;
        state.canvasState.offsetX = canvasInstance.canvas.width / 2;
        state.canvasState.offsetY = canvasInstance.canvas.height / 2;
        if (canvasInstance) canvasInstance.draw();
        return;
    }

    const padding = 20;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;

    if (bboxWidth <= 0 || bboxHeight <= 0) {
        state.canvasState.scale = 10;
        state.canvasState.offsetX = canvasInstance.canvas.width / 2 - minX * 10;
        state.canvasState.offsetY = canvasInstance.canvas.height / 2 + minY * 10;
        if (canvasInstance) canvasInstance.draw();
        return;
    }

    const targetW = canvasInstance.canvas.width * 0.95;
    const targetH = canvasInstance.canvas.height * 0.95;

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

function syncConnectedProperties(childInst, parentId) {
    const parent = state.placedInstances.find(i => i.id === parentId);
    if (!parent || (parent.type !== 'differential' && parent.type !== 'diff_gnd')) return;

    childInst.x = parent.x;
    childInst.y = parent.y;
    childInst.properties.pitch = parent.properties.pitch;
    childInst.properties.orientation = parent.properties.orientation;
    childInst.properties.arrowDirection = parent.properties.arrowDirection;
}

function syncConnectedRecursive(parentId) {
    state.placedInstances.forEach(other => {
        if (other.properties.connectedDiffPairId === parentId && (other.type === 'differential' || other.type === 'diff_gnd')) {
            syncConnectedProperties(other, parentId);
            syncConnectedRecursive(other.id);
        }
    });
}

function initSplitter() {
    const splitter = document.getElementById('placement-splitter');
    const upper = document.querySelector('.placed-instances-section');
    const lower = document.querySelector('.instance-properties-section');
    const container = document.querySelector('.placement-right');

    if (!splitter || !upper || !lower || !container) return;

    let isResizing = false;

    splitter.onmousedown = (e) => {
        isResizing = true;
        document.body.style.cursor = 'ns-resize';

        // Add overlay to prevent interference
        const overlay = document.createElement('div');
        overlay.id = 'resize-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.zIndex = '9999';
        overlay.style.cursor = 'ns-resize';
        document.body.appendChild(overlay);

        const containerRect = container.getBoundingClientRect();

        const onMouseMove = (moveEvent) => {
            if (!isResizing) return;
            const newUpperHeight = Math.max(100, Math.min(moveEvent.clientY - containerRect.top, containerRect.height - 100));
            const upperPercent = (newUpperHeight / containerRect.height) * 100;

            upper.style.flex = `0 0 ${upperPercent}%`;
            lower.style.flex = `1 1 auto`;
        };

        const onMouseUp = () => {
            isResizing = false;
            document.body.style.cursor = '';
            const existingOverlay = document.getElementById('resize-overlay');
            if (existingOverlay) existingOverlay.remove();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
}

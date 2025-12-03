
import { state, resetProjectData } from '../state.js';
import { addMessage } from '../utils.js';

export function createNewStackup() {
    try {
        let n = prompt("Enter number of layers:", "4");
        if (n === null) return;
        n = parseInt(n);

        if (!n || n < 1) {
            alert("Please enter a valid number of layers.");
            return;
        }

        resetProjectData();

        state.currentStackup = [];
        // Top Dielectric (SolderMask)
        state.currentStackup.push(createLayer("SolderMask_Top", "Dielectric", 0.02, 3.5, 0.02, "", ""));

        for (let i = 1; i <= n; i++) {
            // Conductor
            state.currentStackup.push(createLayer(`L${i}`, "Conductor", 0.035, "", "", 5.8e7, "FR4", false));
            // Dielectric (between layers or bottom)
            if (i < n) {
                state.currentStackup.push(createLayer(`Dielectric_${i}_${i + 1}`, "Dielectric", 0.1, 4.4, 0.02, "", ""));
            }
        }

        // Bottom Dielectric (SolderMask)
        state.currentStackup.push(createLayer("SolderMask_Bottom", "Dielectric", 0.02, 3.5, 0.02, "", ""));

        renderStackupTable();
        render2DView();
        addMessage(`Created new stackup with ${n} conductor layers.`);
    } catch (e) {
        addMessage(`Error creating stackup: ${e}`);
        console.error(e);
        alert(`Error creating stackup: ${e}`);
    }
}

export function createLayer(name, type, thickness, dk, df, cond, fill, isRef = false, dogBone = -1) {
    return {
        name: name,
        type: type,
        thickness: thickness,
        dk: dk,
        df: df,
        conductivity: cond,
        fillMaterial: fill,
        isReference: isRef,
        dogBone: dogBone
    };
}

export function renderStackupTable() {
    const tbody = document.querySelector('#stackup-table tbody');
    if (!tbody) {
        // addMessage("Error: tbody not found!"); // Silent fail or log?
        return;
    }
    tbody.innerHTML = '';

    state.currentStackup.forEach((layer, index) => {
        const tr = document.createElement('tr');

        if (layer.type === 'Conductor') {
            tr.classList.add('row-conductor');
        } else if (layer.type === 'Dielectric') {
            tr.classList.add('row-dielectric');
        }

        const createInput = (key, type = 'text', disabled = false) => {
            let val = layer[key];
            if (key === 'dogBone') {
                if (!layer.isReference) {
                    val = '';
                } else if (val === undefined || val === null || val === '') {
                    val = -1;
                }
            }
            return `<input type="${type}" value="${val !== undefined ? val : ''}" 
                    onchange="window.updateLayer(${index}, '${key}', this.value)" ${disabled ? 'disabled' : ''}>`;
        };

        const createSelect = (key, options) => {
            const opts = options.map(o => `<option value="${o}" ${layer[key] === o ? 'selected' : ''}>${o}</option>`).join('');
            return `<select onchange="window.updateLayer(${index}, '${key}', this.value)">${opts}</select>`;
        };

        const createCheckbox = (key, disabled = false) => {
            if (disabled) return '';
            return `<input type="checkbox" ${layer[key] ? 'checked' : ''} 
                    onchange="window.updateLayer(${index}, '${key}', this.checked)">`;
        };

        tr.innerHTML = `
            <td>${createInput('name')}</td>
            <td>${createSelect('type', ['Conductor', 'Dielectric'])}</td>
            <td>${createInput('thickness', 'number')}</td>
            <td>${createInput('dk', 'number', layer.type === 'Conductor')}</td>
            <td>${createInput('df', 'number', layer.type === 'Conductor')}</td>
            <td>${createInput('conductivity', 'number', layer.type === 'Dielectric')}</td>
            <td>${createCheckbox('isReference', layer.type !== 'Conductor')}</td>
            <td>${createInput('dogBone', 'number', !layer.isReference)}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function updateLayer(index, key, value) {
    if (key === 'thickness' || key === 'dk' || key === 'df' || key === 'conductivity' || key === 'dogBone') {
        value = parseFloat(value);
    }
    state.currentStackup[index][key] = value;

    if (key === 'type') {
        if (value === 'Conductor') {
            state.currentStackup[index].dk = "";
            state.currentStackup[index].df = "";
            state.currentStackup[index].fillMaterial = "";
        } else {
            state.currentStackup[index].conductivity = "";
            state.currentStackup[index].isReference = false;
        }
        renderStackupTable();
    }
    if (key === 'isReference') {
        if (value === true && (state.currentStackup[index].dogBone === undefined || state.currentStackup[index].dogBone === null)) {
            state.currentStackup[index].dogBone = -1;
        }
        renderStackupTable();
    }
    render2DView();
}

export function toggleUnits(unit) {
    if (unit === state.currentUnits) return;

    const factor = unit === 'mm' ? 0.0254 : 1 / 0.0254;

    state.currentStackup.forEach(layer => {
        if (layer.thickness) {
            layer.thickness = parseFloat((layer.thickness * factor).toFixed(4));
        }
    });

    state.currentUnits = unit;
    renderStackupTable();
    addMessage(`Units switched to ${unit}`);
}

export function handlePaste(event) {
    event.preventDefault();
    const clipboardData = event.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text');

    const rows = pastedData.trim().split('\n');
    if (rows.length === 0) return;

    state.currentStackup = [];
    rows.forEach(row => {
        const cols = row.split('\t');
        if (cols.length >= 3) {
            state.currentStackup.push({
                name: cols[0] || "Layer",
                type: cols[1] || "Dielectric",
                thickness: parseFloat(cols[2]) || 0,
                dk: parseFloat(cols[3]) || "",
                df: parseFloat(cols[4]) || "",
                conductivity: parseFloat(cols[5]) || "",
                fillMaterial: cols[6] || "",
                isReference: cols[7] && (cols[7].toLowerCase() === 'true' || cols[7] === '1'),
                dogBone: !isNaN(parseFloat(cols[8])) ? parseFloat(cols[8]) : -1
            });
        }
    });

    renderStackupTable();
    render2DView();
    addMessage(`Pasted ${state.currentStackup.length} layers.`);
}

export function render2DView() {
    const container = document.getElementById('stackup-visualizer');
    if (!container) return;
    container.innerHTML = '';

    if (state.currentStackup.length === 0) return;

    const totalThickness = state.currentStackup.reduce((sum, l) => sum + (l.thickness || 0), 0);
    if (totalThickness === 0) return;

    const height = container.clientHeight;
    const scaleY = (height - 20) / totalThickness;
    let currentY = 10;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    state.currentStackup.forEach(layer => {
        const h = (layer.thickness || 0) * scaleY;
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", "10%");
        rect.setAttribute("y", currentY);
        rect.setAttribute("width", "80%");
        rect.setAttribute("height", h);

        if (layer.isReference) {
            rect.setAttribute("fill", "#0000ff");
        } else if (layer.type === 'Conductor') {
            rect.setAttribute("fill", "#b87333");
        } else {
            rect.setAttribute("fill", "#4caf50");
            rect.setAttribute("opacity", "0.6");
        }
        rect.setAttribute("stroke", "#666");
        rect.setAttribute("stroke-width", "1");

        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${layer.name} (${layer.thickness} ${state.currentUnits})`;
        rect.appendChild(title);

        svg.appendChild(rect);
        currentY += h;
    });

    container.appendChild(svg);
}

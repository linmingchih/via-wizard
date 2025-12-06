
import { state } from '../state.js';

export function renderPadstackTab() {
    const warningDiv = document.getElementById('padstack-warning');
    const contentDiv = document.getElementById('padstack-content');

    if (!state.currentStackup || state.currentStackup.length === 0) {
        if (warningDiv) warningDiv.classList.remove('hidden');
        if (contentDiv) contentDiv.classList.add('hidden');
        return;
    } else {
        if (warningDiv) warningDiv.classList.add('hidden');
        if (contentDiv) contentDiv.classList.remove('hidden');
    }

    renderPadstackList();
    renderPadstackForm();
}

export function addPadstack() {
    const name = `Padstack_${state.padstacks.length + 1}`;
    const newPadstack = {
        name: name,
        holeDiameter: 10,
        padSize: 18,
        antipadSize: 28,
        material: "Copper",
        plating: 100,
        startLayer: (() => {
            const conductors = state.currentStackup.filter(l => l.type === 'Conductor');
            return conductors.length > 0 ? conductors[0].name : "";
        })(),
        stopLayer: (() => {
            const conductors = state.currentStackup.filter(l => l.type === 'Conductor');
            return conductors.length > 0 ? conductors[conductors.length - 1].name : "";
        })(),
        backdrill: {
            enabled: false,
            diameter: 10,
            mode: "layer",
            toLayer: "",
            stub: 0,
            depth: 0
        },
        fill: {
            enabled: false,
            dk: 4,
            df: 0.02
        },
        layers: {}
    };

    state.padstacks.push(newPadstack);
    state.currentPadstackIndex = state.padstacks.length - 1;
    renderPadstackTab();
}

export function deletePadstack() {
    if (state.currentPadstackIndex >= 0 && state.currentPadstackIndex < state.padstacks.length) {
        state.padstacks.splice(state.currentPadstackIndex, 1);
        state.currentPadstackIndex = state.padstacks.length > 0 ? 0 : -1;
        renderPadstackTab();
    }
}

export function selectPadstack(index) {
    state.currentPadstackIndex = index;
    renderPadstackTab();
}

export function renderPadstackList() {
    const list = document.getElementById('padstack-list');
    if (!list) return;
    list.innerHTML = '';
    state.padstacks.forEach((p, i) => {
        const li = document.createElement('li');
        li.textContent = p.name;
        if (i === state.currentPadstackIndex) li.classList.add('active');
        li.onclick = () => selectPadstack(i);
        list.appendChild(li);
    });
}

export function renderPadstackForm() {
    if (state.currentPadstackIndex === -1) {
        const inputs = ['pad-name', 'pad-hole-diam', 'pad-size', 'pad-antipad-size', 'pad-material', 'pad-plating', 'pad-start-layer', 'pad-stop-layer', 'fill-dk', 'fill-df'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        return;
    }

    const p = state.padstacks[state.currentPadstackIndex];
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('pad-name', p.name);
    setVal('pad-hole-diam', p.holeDiameter);
    setVal('pad-size', p.padSize);
    setVal('pad-antipad-size', p.antipadSize);
    setVal('pad-material', p.material);
    setVal('pad-plating', p.plating);

    const startSelect = document.getElementById('pad-start-layer');
    const stopSelect = document.getElementById('pad-stop-layer');

    if (startSelect && stopSelect) {
        startSelect.innerHTML = '';
        stopSelect.innerHTML = '';

        state.currentStackup.forEach(l => {
            if (l.type === 'Conductor') {
                startSelect.add(new Option(l.name, l.name));
                stopSelect.add(new Option(l.name, l.name));
            }
        });

        startSelect.value = p.startLayer;
        stopSelect.value = p.stopLayer;
    }

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

    const radios = document.getElementsByName('bd-mode');
    radios.forEach(r => {
        if (r.value === p.backdrill.mode) r.checked = true;
    });
    toggleBdMode(p.backdrill.mode);

    const toLayerSelect = document.getElementById('bd-to-layer');
    if (toLayerSelect) {
        toLayerSelect.innerHTML = '';
        state.currentStackup.forEach(l => {
            if (l.type === 'Conductor') {
                toLayerSelect.add(new Option(l.name, l.name));
            }
        });
        toLayerSelect.value = p.backdrill.toLayer;
    }
    setVal('bd-stub', p.backdrill.stub);
    setVal('bd-depth', p.backdrill.depth);

    // Fill Properties
    const fillCheck = document.getElementById('fill');
    if (fillCheck) fillCheck.checked = p.fill && p.fill.enabled;

    const fillPropsDiv = document.getElementById('fill-properties');
    if (fillPropsDiv) {
        if (p.fill && p.fill.enabled) {
            fillPropsDiv.classList.remove('disabled');
            const dkInput = document.getElementById('fill-dk');
            const dfInput = document.getElementById('fill-df');
            if (dkInput) dkInput.disabled = false;
            if (dfInput) dfInput.disabled = false;
        } else {
            fillPropsDiv.classList.add('disabled');
            const dkInput = document.getElementById('fill-dk');
            const dfInput = document.getElementById('fill-df');
            if (dkInput) dkInput.disabled = true;
            if (dfInput) dfInput.disabled = true;
        }
    }

    if (p.fill) {
        setVal('fill-dk', p.fill.dk);
        setVal('fill-df', p.fill.df);
    } else {
        setVal('fill-dk', 4);
        setVal('fill-df', 0.02);
    }
}


export function updatePadstackProperty(key, value) {
    if (state.currentPadstackIndex === -1) return;
    const p = state.padstacks[state.currentPadstackIndex];
    if (key === 'holeDiameter' || key === 'padSize' || key === 'antipadSize' || key === 'plating') {
        value = parseFloat(value);
    }
    p[key] = value;
    if (key === 'name') renderPadstackList();

    // Trigger canvas redraw if available
    if (window.drawPlacementCanvas) window.drawPlacementCanvas();
}

export function toggleBackdrill(enabled) {
    if (state.currentPadstackIndex === -1) return;
    state.padstacks[state.currentPadstackIndex].backdrill.enabled = enabled;
    const bdConfigDiv = document.getElementById('backdrill-inline-config');
    if (bdConfigDiv) {
        if (enabled) {
            bdConfigDiv.classList.remove('disabled');
        } else {
            bdConfigDiv.classList.add('disabled');
        }
    }
}

export function toggleBdMode(mode) {
    if (state.currentPadstackIndex !== -1) {
        state.padstacks[state.currentPadstackIndex].backdrill.mode = mode;
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

export function updateBackdrillProperty(key, value) {
    if (state.currentPadstackIndex === -1) return;
    const p = state.padstacks[state.currentPadstackIndex];
    if (key === 'diameter' || key === 'stub' || key === 'depth') {
        value = parseFloat(value);
    }
    p.backdrill[key] = value;
}

export function toggleFill(enabled) {
    if (state.currentPadstackIndex === -1) return;
    if (!state.padstacks[state.currentPadstackIndex].fill) {
        state.padstacks[state.currentPadstackIndex].fill = {
            enabled: false,
            dk: 4,
            df: 0.02
        };
    }
    state.padstacks[state.currentPadstackIndex].fill.enabled = enabled;

    const fillPropsDiv = document.getElementById('fill-properties');
    const dkInput = document.getElementById('fill-dk');
    const dfInput = document.getElementById('fill-df');

    if (fillPropsDiv) {
        if (enabled) {
            fillPropsDiv.classList.remove('disabled');
            if (dkInput) dkInput.disabled = false;
            if (dfInput) dfInput.disabled = false;
        } else {
            fillPropsDiv.classList.add('disabled');
            if (dkInput) dkInput.disabled = true;
            if (dfInput) dfInput.disabled = true;
        }
    }
}

export function updateFillProperty(key, value) {
    if (state.currentPadstackIndex === -1) return;
    if (!state.padstacks[state.currentPadstackIndex].fill) return;

    const p = state.padstacks[state.currentPadstackIndex];
    if (key === 'dk' || key === 'df') {
        value = parseFloat(value);
    }
    p.fill[key] = value;
}

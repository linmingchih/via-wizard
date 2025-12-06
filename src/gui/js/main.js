
import { state, resetProjectData } from './state.js';
import { api } from './api.js';
import { addMessage, clearMessages, toggleMessageWindow, copyMessages, calculateFeedPaths } from './utils.js';
import * as stackup from './tabs/stackup.js';
import * as padstack from './tabs/padstack.js';
import * as placement from './tabs/placement.js';
import * as simulation from './tabs/simulation.js';

// Expose functions to window for HTML onclick handlers
window.toggleMessageWindow = toggleMessageWindow;
window.clearMessages = clearMessages;
window.copyMessages = copyMessages;
window.addMessage = addMessage;

// Stackup
window.createNewStackup = stackup.createNewStackup;
window.updateLayer = stackup.updateLayer;
window.toggleUnits = stackup.toggleUnits;
window.handlePaste = stackup.handlePaste;

// Padstack
window.addPadstack = padstack.addPadstack;
window.deletePadstack = padstack.deletePadstack;
window.updatePadstackProperty = padstack.updatePadstackProperty;
window.toggleBackdrill = padstack.toggleBackdrill;
window.toggleBdMode = padstack.toggleBdMode;
window.updateBackdrillProperty = padstack.updateBackdrillProperty;
window.toggleFill = padstack.toggleFill;
window.updateFillProperty = padstack.updateFillProperty;

// Placement
window.renderPlacementTab = placement.renderPlacementTab;
window.updatePlacementMode = placement.updatePlacementMode;
window.fitCanvas = placement.fitCanvas;
window.updateGrid = placement.updateGrid;
window.updateInstanceProp = placement.updateInstanceProp;
window.deleteInstance = placement.deleteInstance;

// Simulation
window.exportAEDB = simulation.exportAEDB;

// API
window.loadProject = async () => {
    addMessage("Load Project clicked...");
    try {
        const data = await api.loadProject();
        addMessage(`API returned data: ${data ? 'yes' : 'no'}`);
        if (data) {
            if (data.stackup) state.currentStackup = data.stackup;
            if (data.units) state.currentUnits = data.units;
            if (data.padstacks) state.padstacks = data.padstacks;
            if (data.placedInstances) state.placedInstances = data.placedInstances;
            if (data.canvasGridSpacing) state.canvasState.gridSpacing = data.canvasGridSpacing;

            // Update UI
            stackup.renderStackupTable();
            stackup.render2DView();
            padstack.renderPadstackList();
            placement.renderPlacementTab();

            // Restore units UI
            const radio = document.querySelector(`input[name="units"][value="${state.currentUnits}"]`);
            if (radio) radio.checked = true;

            // Restore board size
            if (data.boardWidth) {
                const wInput = document.getElementById('canvas-width');
                if (wInput) wInput.value = data.boardWidth;
            }
            if (data.boardHeight) {
                const hInput = document.getElementById('canvas-height');
                if (hInput) hInput.value = data.boardHeight;
            }

            addMessage("Project loaded successfully.");
        }
    } catch (err) {
        addMessage(`Error loading project: ${err}`);
        console.error(err);
    }
};

window.saveProject = async () => {
    const wInput = document.getElementById('canvas-width');
    const hInput = document.getElementById('canvas-height');
    const boardW = wInput ? (parseFloat(wInput.value) || 400) : 400;
    const boardH = hInput ? (parseFloat(hInput.value) || 200) : 200;

    const instancesWithPaths = state.placedInstances.map(inst => {
        const feedPaths = calculateFeedPaths(inst, boardW, boardH);
        return { ...inst, feedPaths };
    });

    const projectData = {
        stackup: state.currentStackup,
        units: state.currentUnits,
        padstacks: state.padstacks,
        placedInstances: instancesWithPaths,
        canvasGridSpacing: state.canvasState.gridSpacing,
        boardWidth: boardW,
        boardHeight: boardH
    };
    await api.saveProject(projectData);
};

window.openFile = async () => {
    const path = await api.openFile();
    if (path && path.endsWith('.xml')) {
        const result = await api.parseStackupXml(path);
        let layers = result;
        let unit = 'mm';
        if (result && !Array.isArray(result) && result.layers) {
            layers = result.layers;
            unit = result.unit || 'mm';
        }

        if (layers) {
            resetProjectData();
            state.currentStackup = layers;
            state.currentUnits = unit;

            const radio = document.querySelector(`input[name="units"][value="${unit}"]`);
            if (radio) radio.checked = true;

            stackup.renderStackupTable();
            stackup.render2DView();
            addMessage(`Loaded stackup from ${path}`);
        }
    }
};

window.exitApp = api.exitApp;

// Tab Switching
window.openTab = function (tabId) {
    const panes = document.querySelectorAll('.tab-pane');
    panes.forEach(pane => pane.classList.remove('active'));
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const targetPane = document.getElementById(tabId);
    if (targetPane) {
        targetPane.classList.add('active');
    }

    // Find button
    const activeBtn = Array.from(buttons).find(btn => btn.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'tab-stackup') {
        stackup.render2DView();
    } else if (tabId === 'tab-padstack') {
        padstack.renderPadstackTab();
    } else if (tabId === 'tab-placement') {
        placement.renderPlacementTab();
    } else if (tabId === 'tab-simulation') {
        const msgWindow = document.getElementById('message-window');
        if (msgWindow && msgWindow.classList.contains('hidden')) {
            toggleMessageWindow();
        }
    }
};

// Initialization
window.addEventListener('pywebviewready', function () {
    addMessage("Via Wizard GUI Initialized.");
    api.parseStackupXml('stack.xml').then(layers => {
        if (layers && layers.length > 0) {
            state.currentStackup = layers;
            stackup.renderStackupTable();
            stackup.render2DView();
            addMessage(`Loaded ${layers.length} layers from stack.xml`);
        }
    }).catch(err => {
        // addMessage("Error loading stackup: " + err);
    });
});

// Global Error Handler
window.onerror = function (message, source, lineno, colno, error) {
    addMessage(`JS Error: ${message} at ${source}:${lineno}`);
    return false;
};

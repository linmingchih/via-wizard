
import { state } from '../state.js';
import { api } from '../api.js';
import { addMessage } from '../utils.js';
import { calculateFeedPaths } from './placement.js';

export async function exportAEDB() {
    const versionInput = document.getElementById('aedb-version');
    const version = versionInput ? versionInput.value : '2024.1';

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

    addMessage(`Exporting to AEDB version ${version}...`);
    await api.exportAEDB(projectData, version);
}


export const state = {
    isMessageWindowVisible: false,
    currentStackup: [],
    currentUnits: 'mm',
    padstacks: [],
    currentPadstackIndex: -1,
    placedInstances: [],
    selectedInstanceId: null,
    placementMode: 'single',
    canvasState: {
        scale: 10,
        offsetX: 0,
        offsetY: 0,
        isDragging: false,
        lastX: 0,
        lastY: 0,
        gridSpacing: 5
    }
};

export function resetProjectData() {
    state.padstacks = [];
    state.currentPadstackIndex = -1;
    state.placedInstances = [];
    state.selectedInstanceId = null;
}

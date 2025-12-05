
import { state } from '../state.js';
import { addMessage, calculateFeedPaths } from '../utils.js';

export class PlacementCanvas {
    constructor(canvasId, wrapperId, callbacks) {
        this.canvas = document.getElementById(canvasId);
        this.wrapper = document.getElementById(wrapperId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.callbacks = callbacks || {}; // onSelect, onPlace, onUpdate

        if (this.canvas && this.wrapper) {
            this.init();
        }
    }

    init() {
        const resizeObserver = new ResizeObserver(() => {
            this.resize();
        });
        resizeObserver.observe(this.wrapper);

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

        // Initial resize
        this.resize();
    }

    resize() {
        if (!this.canvas || !this.wrapper) return;
        this.canvas.width = this.wrapper.clientWidth;
        this.canvas.height = this.wrapper.clientHeight;

        // If offset is not set (first run), center it
        if (state.canvasState.offsetX === 0 && state.canvasState.offsetY === 0) {
            state.canvasState.offsetX = this.canvas.width / 2;
            state.canvasState.offsetY = this.canvas.height / 2;
        }
        this.draw();
    }

    draw() {
        if (!this.ctx || !this.canvas) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const cs = state.canvasState;

        // Clear
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, width, height);

        // Transform
        this.ctx.save();
        this.ctx.translate(cs.offsetX, cs.offsetY);
        this.ctx.scale(cs.scale, -cs.scale);

        this.drawGrid();
        this.drawBoardOutline();
        this.drawAxes();

        state.placedInstances.forEach(inst => {
            this.drawInstance(inst);
        });

        this.ctx.restore();
    }

    drawGrid() {
        const spacing = state.canvasState.gridSpacing;
        const steps = 100;

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1 / state.canvasState.scale;

        for (let i = -steps; i <= steps; i++) {
            const pos = i * spacing;
            this.ctx.moveTo(pos, -steps * spacing);
            this.ctx.lineTo(pos, steps * spacing);
            this.ctx.moveTo(-steps * spacing, pos);
            this.ctx.lineTo(steps * spacing, pos);
        }
        this.ctx.stroke();
    }

    drawBoardOutline() {
        const boardW = parseFloat(document.getElementById('canvas-width')?.value) || 0;
        const boardH = parseFloat(document.getElementById('canvas-height')?.value) || 0;

        if (boardW > 0 && boardH > 0) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
            this.ctx.fillRect(-boardW / 2, -boardH / 2, boardW, boardH);

            this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
            this.ctx.lineWidth = 2 / state.canvasState.scale;
            this.ctx.strokeRect(-boardW / 2, -boardH / 2, boardW, boardH);
        }
    }

    drawAxes() {
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2 / state.canvasState.scale;
        this.ctx.moveTo(-1000, 0); this.ctx.lineTo(1000, 0);
        this.ctx.moveTo(0, -1000); this.ctx.lineTo(0, 1000);
        this.ctx.stroke();
    }

    drawInstance(inst) {
        const pIndex = inst.padstackIndex;
        if (pIndex < 0 || pIndex >= state.padstacks.length) return;
        const p = state.padstacks[pIndex];

        let diameter = p.padSize || 20;
        if (p.holeDiameter > diameter) diameter = p.holeDiameter;

        let antipadDiameter = p.antipadSize || 30;

        let color = '#b87333';
        if (inst.type === 'gnd') color = '#998877';
        if (inst.id === state.selectedInstanceId) color = '#007acc';

        const boardW = parseFloat(document.getElementById('canvas-width')?.value) || 0;
        const boardH = parseFloat(document.getElementById('canvas-height')?.value) || 0;

        if (inst.type === 'single' || inst.type === 'gnd') {
            const effectiveAntipad = (inst.type === 'gnd') ? 0 : antipadDiameter;
            if (inst.type === 'single') {
                this.drawFeedLine(inst.x, inst.y, inst.properties.feedInWidth, inst.properties.arrowDirection, true, boardW, boardH, inst);
                this.drawFeedLine(inst.x, inst.y, inst.properties.feedOutWidth, inst.properties.arrowDirection, false, boardW, boardH, inst);
            }
            this.drawVia(inst.x, inst.y, diameter, color, p.holeDiameter, inst.properties.arrowDirection, effectiveAntipad);
        } else if (inst.type === 'differential' || inst.type === 'diff_gnd') {
            const pitch = inst.properties.pitch || 1.0;
            const isVert = inst.properties.orientation === 'vertical';
            const dx = isVert ? 0 : pitch / 2;
            const dy = isVert ? pitch / 2 : 0;

            this.drawDiffFeeds(inst, true, boardW, boardH);
            this.drawDiffFeeds(inst, false, boardW, boardH);

            // Oblong Antipad
            if (antipadDiameter && antipadDiameter > 0) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = '#aaa';
                this.ctx.setLineDash([4, 2]);
                this.ctx.lineWidth = 1 / state.canvasState.scale;
                const r = antipadDiameter / 2;

                if (isVert) {
                    this.ctx.arc(inst.x, inst.y + dy, r, 0, Math.PI, false);
                    this.ctx.arc(inst.x, inst.y - dy, r, Math.PI, 0, false);
                } else {
                    this.ctx.arc(inst.x - dx, inst.y, r, Math.PI / 2, 3 * Math.PI / 2, false);
                    this.ctx.arc(inst.x + dx, inst.y, r, -Math.PI / 2, Math.PI / 2, false);
                }
                this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }

            this.drawVia(inst.x - dx, inst.y - dy, diameter, color, p.holeDiameter, inst.properties.arrowDirection, 0);
            this.drawVia(inst.x + dx, inst.y + dy, diameter, color, p.holeDiameter, inst.properties.arrowDirection, 0);

            // Link line
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#666';
            this.ctx.setLineDash([0.5, 0.5]);
            this.ctx.lineWidth = 0.5 / state.canvasState.scale;
            this.ctx.moveTo(inst.x - dx, inst.y - dy);
            this.ctx.lineTo(inst.x + dx, inst.y + dy);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Draw GND Vias for diff_gnd
            if (inst.type === 'diff_gnd') {
                const gndR = inst.properties.gndRadius || 15;
                const gndN = inst.properties.gndCount || 3;
                const gndStep = inst.properties.gndAngleStep || 30;
                const gndPIndex = inst.properties.gndPadstackIndex;

                let gndDiam = 10;
                let gndHole = 6;
                let gndColor = '#998877';

                if (gndPIndex >= 0 && gndPIndex < state.padstacks.length) {
                    const gp = state.padstacks[gndPIndex];
                    gndDiam = gp.padSize || 10;
                    gndHole = gp.holeDiameter || 6;
                }

                // Calculate angles
                const angles = [];
                if (gndN % 2 !== 0) { // Odd
                    angles.push(0);
                    for (let i = 1; i <= (gndN - 1) / 2; i++) {
                        angles.push(i * gndStep);
                        angles.push(-i * gndStep);
                    }
                } else { // Even
                    for (let i = 1; i <= gndN / 2; i++) {
                        const angle = (2 * i - 1) * gndStep / 2;
                        angles.push(angle);
                        angles.push(-angle);
                    }
                }

                // Signal Via Centers
                // 1. "Left" / "Bottom" (negative offset)
                const s1 = { x: inst.x - dx, y: inst.y - dy };
                // 2. "Right" / "Top" (positive offset)
                const s2 = { x: inst.x + dx, y: inst.y + dy };

                // Outward axes (in degrees)
                // Horizontal: Left via (-dx) outward is -x (180), Right via (+dx) outward is +x (0)
                // Vertical: Bottom via (-dy) outward is -y (270/-90), Top via (+dy) outward is +y (90)
                let angleBase1, angleBase2;

                if (isVert) {
                    angleBase1 = 270; // Bottom via, outward is down
                    angleBase2 = 90;  // Top via, outward is up
                } else {
                    angleBase1 = 180; // Left via, outward is left
                    angleBase2 = 0;   // Right via, outward is right
                }

                const drawGnds = (center, baseAngle) => {
                    angles.forEach(a => {
                        const rad = (baseAngle + a) * Math.PI / 180;
                        const gx = center.x + gndR * Math.cos(rad);
                        const gy = center.y + gndR * Math.sin(rad);
                        this.drawVia(gx, gy, gndDiam, gndColor, gndHole, null, 0);
                    });
                };

                drawGnds(s1, angleBase1);
                drawGnds(s2, angleBase2);
            }
        }
    }

    drawVia(x, y, diameter, color, holeDiameter, arrowDirection, antipadDiameter) {
        if (antipadDiameter && antipadDiameter > 0) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#aaa';
            this.ctx.setLineDash([4, 2]);
            this.ctx.lineWidth = 1 / state.canvasState.scale;
            this.ctx.arc(x, y, antipadDiameter / 2, 0, 2 * Math.PI);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        this.ctx.beginPath();
        this.ctx.fillStyle = color;
        this.ctx.arc(x, y, diameter / 2, 0, 2 * Math.PI);
        this.ctx.fill();

        if (holeDiameter) {
            this.ctx.beginPath();
            this.ctx.fillStyle = '#000';
            this.ctx.arc(x, y, holeDiameter / 2, 0, 2 * Math.PI);
            this.ctx.fill();
        }

        if (typeof arrowDirection !== 'undefined' && arrowDirection !== null) {
            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.rotate(-arrowDirection * Math.PI / 2);
            const r = diameter / 2;
            this.ctx.beginPath();
            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = r * 0.05;
            this.ctx.lineJoin = 'round';

            const tipY = r * 0.5;
            const baseY = -r * 0.5;
            const headWidth = r * 0.6;
            const shaftWidth = r * 0.25;
            const headLength = r * 0.45;
            const shaftTop = tipY - headLength;

            this.ctx.moveTo(0, tipY);
            this.ctx.lineTo(headWidth / 2, shaftTop);
            this.ctx.lineTo(shaftWidth / 2, shaftTop);
            this.ctx.lineTo(shaftWidth / 2, baseY);
            this.ctx.lineTo(-shaftWidth / 2, baseY);
            this.ctx.lineTo(-shaftWidth / 2, shaftTop);
            this.ctx.lineTo(-headWidth / 2, shaftTop);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    drawFeedLine(x, y, width, direction, isFeedIn, boardW, boardH, inst) {
        const layerName = isFeedIn ? inst.properties.feedIn : inst.properties.feedOut;
        if (!layerName) return;

        if (!width || width <= 0 || !boardW || !boardH) return;

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#cd7f32';
        this.ctx.lineWidth = width;
        this.ctx.globalAlpha = 0.5;

        let edgeX = x;
        let edgeY = y;
        let targetDir = direction;
        if (isFeedIn) targetDir = (direction + 2) % 4;

        if (targetDir === 0) edgeY = boardH / 2;
        else if (targetDir === 1) edgeX = boardW / 2;
        else if (targetDir === 2) edgeY = -boardH / 2;
        else if (targetDir === 3) edgeX = -boardW / 2;

        this.ctx.moveTo(x, y);
        this.ctx.lineTo(edgeX, edgeY);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;

        this.drawLabel((x + edgeX) / 2, (y + edgeY) / 2, layerName);
    }

    drawDiffFeeds(inst, isFeedIn, boardW, boardH) {
        const layerName = isFeedIn ? inst.properties.feedIn : inst.properties.feedOut;
        if (!layerName) return;

        const width = isFeedIn ? inst.properties.feedInWidth : inst.properties.feedOutWidth;
        if (!width || width <= 0) return;

        // Use shared calculation
        const pathsObj = calculateFeedPaths(inst, boardW, boardH);
        const paths = isFeedIn ? pathsObj.feedIn : pathsObj.feedOut;

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#cd7f32';
        this.ctx.lineWidth = width;
        this.ctx.globalAlpha = 0.5;

        paths.forEach(path => {
            if (path.length > 0) {
                this.ctx.moveTo(path[0].x, path[0].y);
                for (let i = 1; i < path.length; i++) {
                    this.ctx.lineTo(path[i].x, path[i].y);
                }
            }
        });

        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;

        // Draw Label (approximate location at end of path?)
        // Or just use the instance location + offset like before?
        // The old logic calculated label position based on edge.
        // Let's use the last point of the first path as a hint, or just keep it simple.
        // The old logic:
        // lblX = (inst.x + edgeX) / 2;
        // With complex paths, maybe just put it near the via?
        // Or at the midpoint of the path?
        // Let's stick to the instance location for now or try to find a good spot.
        // Actually, let's just use the midpoint of the first segment of the first path for simplicity,
        // or just keep the label near the via.

        // Let's try to replicate the old label logic if possible, or just place it at the end of the path.
        if (paths.length > 0 && paths[0].length > 0) {
            const p = paths[0];
            const lastPt = p[p.length - 1];
            // Midpoint of the whole path is hard to define for polyline.
            // Let's just put it at the end.
            this.drawLabel(lastPt.x, lastPt.y, layerName);
        }
    }

    drawLabel(x, y, text) {
        this.ctx.save();
        this.ctx.fillStyle = '#fff';
        const fontSize = 12 / state.canvasState.scale;
        this.ctx.font = `${fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.translate(x, y);
        this.ctx.scale(1, -1);
        this.ctx.fillText(text, 0, 0);
        this.ctx.restore();
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - state.canvasState.offsetX) / state.canvasState.scale;
        const mouseY = -(e.clientY - rect.top - state.canvasState.offsetY) / state.canvasState.scale;

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            state.canvasState.isDragging = true;
            state.canvasState.dragType = 'pan';
            state.canvasState.lastX = e.clientX;
            state.canvasState.lastY = e.clientY;
            this.canvas.style.cursor = 'move';
        } else if (e.button === 0) {
            const clickedId = this.checkSelection(mouseX, mouseY);
            if (clickedId) {
                if (this.callbacks.onSelect) this.callbacks.onSelect(clickedId);
                state.canvasState.isDragging = true;
                state.canvasState.dragType = 'move';
                state.canvasState.dragInstanceId = clickedId;
                this.canvas.style.cursor = 'grabbing';
            } else {
                if (this.callbacks.onPlace) this.callbacks.onPlace(mouseX, mouseY);
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - state.canvasState.offsetX) / state.canvasState.scale;
        const mouseY = -(e.clientY - rect.top - state.canvasState.offsetY) / state.canvasState.scale;

        if (state.canvasState.isDragging) {
            if (state.canvasState.dragType === 'pan') {
                const dx = e.clientX - state.canvasState.lastX;
                const dy = e.clientY - state.canvasState.lastY;
                state.canvasState.offsetX += dx;
                state.canvasState.offsetY += dy;
                state.canvasState.lastX = e.clientX;
                state.canvasState.lastY = e.clientY;
                this.draw();
            } else if (state.canvasState.dragType === 'move') {
                const inst = state.placedInstances.find(i => i.id === state.canvasState.dragInstanceId);
                if (inst) {
                    const snap = state.canvasState.gridSpacing;
                    inst.x = Math.round(mouseX / snap) * snap;
                    inst.y = Math.round(mouseY / snap) * snap;
                    this.draw();
                    if (this.callbacks.onUpdate) this.callbacks.onUpdate();
                }
            }
        } else {
            const hoveredId = this.checkSelection(mouseX, mouseY);
            this.canvas.style.cursor = hoveredId ? 'grab' : 'crosshair';
        }
    }

    handleMouseUp(e) {
        if (state.canvasState.dragType === 'move') {
            if (this.callbacks.onUpdate) this.callbacks.onUpdate();
        }
        state.canvasState.isDragging = false;
        state.canvasState.dragType = null;
        state.canvasState.dragInstanceId = null;

        // Reset cursor
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - state.canvasState.offsetX) / state.canvasState.scale;
        const mouseY = -(e.clientY - rect.top - state.canvasState.offsetY) / state.canvasState.scale;
        const hoveredId = this.checkSelection(mouseX, mouseY);
        this.canvas.style.cursor = hoveredId ? 'grab' : 'crosshair';
    }

    handleWheel(e) {
        e.preventDefault();
        const scaleFactor = 1.1;
        if (e.deltaY < 0) {
            state.canvasState.scale *= scaleFactor;
        } else {
            state.canvasState.scale /= scaleFactor;
        }
        this.draw();
    }

    handleDoubleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - state.canvasState.offsetX) / state.canvasState.scale;
        const mouseY = -(e.clientY - rect.top - state.canvasState.offsetY) / state.canvasState.scale;

        const clickedId = this.checkSelection(mouseX, mouseY);
        if (clickedId) {
            const inst = state.placedInstances.find(i => i.id === clickedId);
            if (inst) {
                if (inst.type === 'single') {
                    if (typeof inst.properties.arrowDirection === 'undefined') inst.properties.arrowDirection = 0;
                    inst.properties.arrowDirection = (inst.properties.arrowDirection + 1) % 4;
                    this.draw();
                } else if (inst.type === 'differential' || inst.type === 'diff_gnd') {
                    if (typeof inst.properties.arrowDirection === 'undefined') {
                        inst.properties.arrowDirection = (inst.properties.orientation === 'vertical') ? 1 : 0;
                    }
                    if (inst.properties.orientation === 'vertical') {
                        inst.properties.arrowDirection = (inst.properties.arrowDirection === 1) ? 3 : 1;
                    } else {
                        inst.properties.arrowDirection = (inst.properties.arrowDirection === 0) ? 2 : 0;
                    }
                    this.draw();
                }
            }
        }
    }

    checkSelection(x, y) {
        for (let i = state.placedInstances.length - 1; i >= 0; i--) {
            const inst = state.placedInstances[i];
            let radius = 0.5;
            const pIndex = inst.padstackIndex;
            if (pIndex >= 0 && pIndex < state.padstacks.length) {
                const p = state.padstacks[pIndex];
                let maxD = p.padSize || p.holeDiameter || 0;
                if (maxD > 0) radius = maxD / 2;
            }

            if (inst.type === 'differential' || inst.type === 'diff_gnd') {
                const pitch = inst.properties.pitch || 1.0;
                const isVert = inst.properties.orientation === 'vertical';
                const dx = isVert ? 0 : pitch / 2;
                const dy = isVert ? pitch / 2 : 0;
                const x1 = inst.x - dx;
                const y1 = inst.y - dy;
                const x2 = inst.x + dx;
                const y2 = inst.y + dy;

                if (Math.sqrt((x1 - x) ** 2 + (y1 - y) ** 2) <= radius) return inst.id;
                if (Math.sqrt((x2 - x) ** 2 + (y2 - y) ** 2) <= radius) return inst.id;

                // Simple segment check
                const distSq = this.distToSegmentSquared({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 });
                if (distSq <= radius * radius) return inst.id;

            } else {
                const dist = Math.sqrt((inst.x - x) ** 2 + (inst.y - y) ** 2);
                if (dist <= radius) return inst.id;
            }
        }
        return null;
    }

    distToSegmentSquared(p, v, w) {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
    }
}

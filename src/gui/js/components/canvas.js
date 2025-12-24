
import { state } from '../state.js';
import { addMessage, calculateFeedPaths } from '../utils.js';

export class PlacementCanvas {
    constructor(canvasId, wrapperId, callbacks) {
        this.canvas = document.getElementById(canvasId);
        this.wrapper = document.getElementById(wrapperId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.callbacks = callbacks || {}; // onSelect, onPlace, onUpdate

        this.hoveredInstanceId = null;

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
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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

        // Phase 1: Antipads
        state.placedInstances.forEach(inst => {
            this.drawInstance(inst, 'antipad');
        });

        // Phase 2: Traces (Dogbones, Feeds)
        state.placedInstances.forEach(inst => {
            this.drawInstance(inst, 'trace');
        });

        // Phase 3: Vias
        state.placedInstances.forEach(inst => {
            this.drawInstance(inst, 'via');
        });

        this.drawRuler();

        this.ctx.restore();
    }

    drawRuler() {
        const start = state.canvasState.measureStart;
        const end = state.canvasState.measureEnd;
        if (!start || !end) return;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        this.ctx.save();
        const color = '#FFFF00';
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 1 / state.canvasState.scale;

        // Draw Slope (Diagonal)
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();

        // Draw Projections (Triangle legs)
        this.ctx.setLineDash([2 / state.canvasState.scale, 2 / state.canvasState.scale]);
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, start.y); // Horizontal
        this.ctx.lineTo(end.x, end.y);   // Vertical
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Helper to draw text with background
        const drawText = (text, x, y) => {
            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.scale(1, -1); // Unflip text

            const fontSize = 14 / state.canvasState.scale;
            this.ctx.font = `${fontSize}px monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            const metrics = this.ctx.measureText(text);
            const padding = 2;

            // Background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(
                -metrics.width / 2 - padding,
                -fontSize / 2 - padding,
                metrics.width + padding * 2,
                fontSize + padding * 2
            );

            // Text
            this.ctx.fillStyle = color;
            this.ctx.fillText(text, 0, 0);

            this.ctx.restore();
        };

        // Calculate positions with offsets to avoid overlap
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const offsetDist = 20 / state.canvasState.scale;

        // Determine directions
        const signX = (end.x >= start.x) ? 1 : -1;
        const signY = (end.y >= start.y) ? 1 : -1;

        // dx label: Below horizontal leg if dragging up, Above if dragging down
        // Horizontal leg is at y = start.y
        // "Below" means -Y (since Y+ is up in our transformed space)
        // If dragging Up (signY=1), triangle is above start.y. Outside is below (-).
        // If dragging Down (signY=-1), triangle is below start.y. Outside is above (+).
        const dxLabelY = start.y - signY * offsetDist;
        const dxLabelX = midX;

        // dy label: Right of vertical leg if dragging right, Left if dragging left
        // Vertical leg is at x = end.x
        // "Right" means +X.
        // If dragging Right (signX=1), triangle is left of end.x. Outside is right (+).
        // If dragging Left (signX=-1), triangle is right of end.x. Outside is left (-).
        const dyLabelX = end.x + signX * offsetDist;
        const dyLabelY = midY;

        // L label: Opposite to legs (Inside/Above hypotenuse)
        // Shift X opposite to dy label shift
        // Shift Y opposite to dx label shift
        const lLabelX = midX - signX * offsetDist;
        const lLabelY = midY + signY * offsetDist;

        // Draw Labels
        drawText(`L: ${len.toFixed(2)}`, lLabelX, lLabelY);
        drawText(`dx: ${dx.toFixed(2)}`, dxLabelX, dxLabelY);
        drawText(`dy: ${dy.toFixed(2)}`, dyLabelX, dyLabelY);

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

    drawInstance(inst, phase) {
        const pIndex = inst.padstackIndex;
        if (pIndex < 0 || pIndex >= state.padstacks.length) return;
        const p = state.padstacks[pIndex];

        let diameter = p.padSize || 20;
        if (p.holeDiameter > diameter) diameter = p.holeDiameter;

        let antipadDiameter = p.antipadSize || 30;

        let color = '#b87333';
        if (inst.type === 'gnd') color = '#998877';

        if (inst.id === state.selectedInstanceId) {
            color = '#007acc';
        } else if (inst.id === this.hoveredInstanceId) {
            color = '#4da6ff'; // Lighter blue for hover
        }

        const boardW = parseFloat(document.getElementById('canvas-width')?.value) || 0;
        const boardH = parseFloat(document.getElementById('canvas-height')?.value) || 0;

        if (inst.type === 'single' || inst.type === 'gnd') {
            if (phase === 'antipad') {
                const effectiveAntipad = (inst.type === 'gnd') ? 0 : antipadDiameter;
                this.drawAntipadCircle(inst.x, inst.y, effectiveAntipad);
            } else if (phase === 'trace') {
                if (inst.type === 'single') {
                    this.drawFeedLine(inst.x, inst.y, inst.properties.feedInWidth, inst.properties.arrowDirection, true, boardW, boardH, inst);
                    this.drawFeedLine(inst.x, inst.y, inst.properties.feedOutWidth, inst.properties.arrowDirection, false, boardW, boardH, inst);
                }
            } else if (phase === 'via') {
                this.drawVia(inst.x, inst.y, diameter, color, p.holeDiameter, inst.properties.arrowDirection);
            }
        } else if (inst.type === 'differential' || inst.type === 'diff_gnd') {
            const pitch = inst.properties.pitch || 1.0;
            const isVert = inst.properties.orientation === 'vertical';
            const dx = isVert ? 0 : pitch / 2;
            const dy = isVert ? pitch / 2 : 0;

            if (phase === 'antipad') {
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
            } else if (phase === 'trace') {
                this.drawDiffFeeds(inst, true, boardW, boardH);
                this.drawDiffFeeds(inst, false, boardW, boardH);

                // Link line
                this.ctx.beginPath();
                this.ctx.strokeStyle = '#666';
                this.ctx.setLineDash([0.5, 0.5]);
                this.ctx.lineWidth = 0.5 / state.canvasState.scale;
                this.ctx.moveTo(inst.x - dx, inst.y - dy);
                this.ctx.lineTo(inst.x + dx, inst.y + dy);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            } else if (phase === 'via') {
                this.drawVia(inst.x - dx, inst.y - dy, diameter, color, p.holeDiameter, inst.properties.arrowDirection);
                this.drawVia(inst.x + dx, inst.y + dy, diameter, color, p.holeDiameter, inst.properties.arrowDirection);

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
                    const s1 = { x: inst.x - dx, y: inst.y - dy };
                    const s2 = { x: inst.x + dx, y: inst.y + dy };

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
                            this.drawVia(gx, gy, gndDiam, gndColor, gndHole, null);
                        });
                    };

                    drawGnds(s1, angleBase1);
                    drawGnds(s2, angleBase2);
                }
            }
        } else if (inst.type === 'dog_bone') {
            const geom = this.getDogBoneGeometry(inst);
            if (geom) {
                if (phase === 'trace') {
                    const lw = inst.properties.lineWidth || 5;
                    const diam = inst.properties.diameter || 10;

                    this.ctx.beginPath();
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = color;
                    this.ctx.lineWidth = lw;
                    this.ctx.fillStyle = color;

                    if (geom.type === 'single') {
                        // Draw Single Line
                        this.ctx.moveTo(geom.startX, geom.startY);
                        this.ctx.lineTo(geom.end.x, geom.end.y);
                        this.ctx.stroke();

                        // Draw Single End Circle
                        this.ctx.beginPath();
                        this.ctx.arc(geom.end.x, geom.end.y, diam / 2, 0, 2 * Math.PI);
                        this.ctx.fill();
                    } else {
                        // Draw Diff Lines
                        const { posX, posY, negX, negY, pEnd, nEnd } = geom;

                        this.ctx.moveTo(posX, posY);
                        this.ctx.lineTo(pEnd.x, pEnd.y);
                        this.ctx.moveTo(negX, negY);
                        this.ctx.lineTo(nEnd.x, nEnd.y);
                        this.ctx.stroke();

                        // Draw Diff End Circles
                        this.ctx.beginPath();
                        this.ctx.arc(pEnd.x, pEnd.y, diam / 2, 0, 2 * Math.PI);
                        this.ctx.arc(nEnd.x, nEnd.y, diam / 2, 0, 2 * Math.PI);
                        this.ctx.fill();
                    }
                }
            } else {
                if (phase === 'via') {
                    // Not connected, draw placeholder
                    this.drawDisconnectedPlaceholder(inst.x, inst.y, color, "DB");
                }
            }
        } else if (inst.type === 'surround_via_array') {
            if (phase === 'via') {
                const geom = this.getSurroundViaArrayGeometry(inst);
                if (geom) {
                    const gndPIndex = inst.properties.gndPadstackIndex;
                    let gndDiam = 10;
                    let gndHole = 6;
                    let gndColor = '#998877';

                    if (gndPIndex >= 0 && gndPIndex < state.padstacks.length) {
                        const gp = state.padstacks[gndPIndex];
                        gndDiam = gp.padSize || 10;
                        gndHole = gp.holeDiameter || 6;
                    }

                    if (inst.id === state.selectedInstanceId) {
                        gndColor = '#007acc';
                    } else if (inst.id === this.hoveredInstanceId) {
                        gndColor = '#4da6ff';
                    }

                    geom.centers.forEach(c => {
                        this.drawVia(c.x, c.y, gndDiam, gndColor, gndHole, null);
                    });
                } else {
                    // Not connected
                    this.drawDisconnectedPlaceholder(inst.x, inst.y, color, "GA");
                }
            }
        }
    }

    drawAntipadCircle(x, y, diameter) {
        if (!diameter || diameter <= 0) return;
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#aaa';
        this.ctx.setLineDash([4, 2]);
        this.ctx.lineWidth = 1 / state.canvasState.scale;
        this.ctx.arc(x, y, diameter / 2, 0, 2 * Math.PI);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawVia(x, y, diameter, color, holeDiameter, arrowDirection) {
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

        // Draw Pour Outline
        const pour = isFeedIn ? inst.properties.feedInPour : inst.properties.feedOutPour;
        const gap = isFeedIn ? inst.properties.feedInGap : inst.properties.feedOutGap;

        if (pour && gap !== undefined && gap >= 0) {
            const pourWidth = width + 2 * gap;
            this.ctx.save();
            this.ctx.strokeStyle = '#aaa';
            this.ctx.lineWidth = 1 / state.canvasState.scale;
            this.ctx.setLineDash([4 / state.canvasState.scale, 2 / state.canvasState.scale]);

            const halfW = pourWidth / 2;
            let rx, ry, rw, rh;

            if (Math.abs(edgeX - x) < 0.001) { // Vertical
                rx = x - halfW;
                rw = pourWidth;
                ry = Math.min(y, edgeY);
                rh = Math.abs(edgeY - y);
            } else { // Horizontal
                ry = y - halfW;
                rh = pourWidth;
                rx = Math.min(x, edgeX);
                rw = Math.abs(edgeX - x);
            }

            this.ctx.strokeRect(rx, ry, rw, rh);
            this.ctx.restore();
        }
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

        if (paths.length > 0 && paths[0].length > 0) {
            const p = paths[0];
            const lastPt = p[p.length - 1];
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

    drawDisconnectedPlaceholder(x, y, color, text = "?") {
        const size = 20; // Fixed size in world units? Or screen units? Let's use world units relative to scale?
        // Actually, let's make it a fixed world size, e.g., 20mil
        const half = size / 2;

        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / state.canvasState.scale;
        this.ctx.setLineDash([2 / state.canvasState.scale, 2 / state.canvasState.scale]);

        // Draw Box
        this.ctx.strokeRect(x - half, y - half, size, size);

        // Draw Text
        this.ctx.fillStyle = color;
        this.ctx.translate(x, y);
        this.ctx.scale(1, -1); // Unflip text

        const fontSize = 16 / state.canvasState.scale; // Scale font with zoom
        this.ctx.font = `bold ${fontSize}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, 0, 0);

        this.ctx.restore();
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - state.canvasState.offsetX) / state.canvasState.scale;
        const mouseY = -(e.clientY - rect.top - state.canvasState.offsetY) / state.canvasState.scale;

        // Store screen coordinates for click detection
        state.canvasState.startScreenX = e.clientX;
        state.canvasState.startScreenY = e.clientY;

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
                // Potential Place (wait for mouse up)
                state.canvasState.isDragging = true;
                state.canvasState.dragType = 'potential_place';
            }
        } else if (e.button === 2) {
            // Measure
            state.canvasState.isDragging = true;
            state.canvasState.dragType = 'measure';
            const snap = this.getSnapPoint(mouseX, mouseY);
            state.canvasState.measureStart = snap;
            state.canvasState.measureEnd = snap;
            this.draw();
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
            } else if (state.canvasState.dragType === 'measure') {
                const snap = this.getSnapPoint(mouseX, mouseY);
                state.canvasState.measureEnd = snap;
                this.draw();
            }
        } else {
            const hoveredId = this.checkSelection(mouseX, mouseY);

            if (this.hoveredInstanceId !== hoveredId) {
                this.hoveredInstanceId = hoveredId;
                this.draw();
            }

            this.canvas.style.cursor = hoveredId ? 'grab' : 'crosshair';
        }
    }

    handleMouseUp(e) {
        if (state.canvasState.dragType === 'move') {
            if (this.callbacks.onUpdate) this.callbacks.onUpdate();
        } else if (state.canvasState.dragType === 'measure') {
            // Clear measurement
            state.canvasState.measureStart = null;
            state.canvasState.measureEnd = null;
            this.draw();
        } else if (state.canvasState.dragType === 'potential_place') {
            // Check if it was a click (short distance)
            const dist = Math.hypot(e.clientX - state.canvasState.startScreenX, e.clientY - state.canvasState.startScreenY);
            if (dist < 5) {
                // It was a click, trigger place
                if (this.callbacks.onPlace) {
                    const rect = this.canvas.getBoundingClientRect();
                    const mouseX = (e.clientX - rect.left - state.canvasState.offsetX) / state.canvasState.scale;
                    const mouseY = -(e.clientY - rect.top - state.canvasState.offsetY) / state.canvasState.scale;
                    this.callbacks.onPlace(mouseX, mouseY);
                }
            }
        }

        state.canvasState.isDragging = false;
        state.canvasState.dragType = null;
        state.canvasState.dragInstanceId = null;

        // Reset cursor
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - state.canvasState.offsetX) / state.canvasState.scale;
        const mouseY = -(e.clientY - rect.top - state.canvasState.offsetY) / state.canvasState.scale;
        const hoveredId = this.checkSelection(mouseX, mouseY);
        if (this.hoveredInstanceId !== hoveredId) {
            this.hoveredInstanceId = hoveredId;
            this.draw();
        }
        this.canvas.style.cursor = hoveredId ? 'grab' : 'crosshair';
    }

    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert mouse screen pos to world pos (before zoom)
        // ScreenX = WorldX * Scale + OffsetX
        // WorldX = (ScreenX - OffsetX) / Scale
        const worldX = (mouseX - state.canvasState.offsetX) / state.canvasState.scale;
        const worldY = (mouseY - state.canvasState.offsetY) / -state.canvasState.scale; // Y is flipped

        const scaleFactor = 1.1;
        let newScale = state.canvasState.scale;

        if (e.deltaY < 0) {
            newScale *= scaleFactor;
        } else {
            newScale /= scaleFactor;
        }

        // Update Scale
        state.canvasState.scale = newScale;

        // Calculate new Offsets to keep WorldX, WorldY at MouseX, MouseY
        // MouseX = WorldX * NewScale + NewOffsetX
        // NewOffsetX = MouseX - WorldX * NewScale
        state.canvasState.offsetX = mouseX - worldX * newScale;
        state.canvasState.offsetY = mouseY - worldY * -newScale;

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
        const hits = [];
        for (let i = state.placedInstances.length - 1; i >= 0; i--) {
            const inst = state.placedInstances[i];
            if (this.isPointInInstance(inst, x, y)) {
                hits.push(inst);
            }
        }

        if (hits.length === 0) return null;

        // Priority: Vias > Dogbones
        const viaHit = hits.find(inst => inst.type !== 'dog_bone');
        if (viaHit) return viaHit.id;

        return hits[0].id;
    }

    isPointInInstance(inst, x, y) {
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

            if (Math.sqrt((x1 - x) ** 2 + (y1 - y) ** 2) <= radius) return true;
            if (Math.sqrt((x2 - x) ** 2 + (y2 - y) ** 2) <= radius) return true;

            // Simple segment check
            const distSq = this.distToSegmentSquared({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 });
            if (distSq <= radius * radius) return true;

        } else if (inst.type === 'dog_bone') {
            const geom = this.getDogBoneGeometry(inst);
            if (geom) {
                const diam = inst.properties.diameter || 10;
                const r = diam / 2;

                if (geom.type === 'single') {
                    if (Math.hypot(geom.end.x - x, geom.end.y - y) <= r) return true;
                    // Check line
                    if (this.distToSegmentSquared({ x, y }, { x: geom.startX, y: geom.startY }, { x: geom.end.x, y: geom.end.y }) <= (inst.properties.lineWidth / 2) ** 2) return true;
                } else {
                    const { pEnd, nEnd } = geom;
                    if (Math.hypot(pEnd.x - x, pEnd.y - y) <= r) return true;
                    if (Math.hypot(nEnd.x - x, nEnd.y - y) <= r) return true;
                    // Check lines
                    const lw2 = (inst.properties.lineWidth / 2) ** 2;
                    if (this.distToSegmentSquared({ x, y }, { x: geom.posX, y: geom.posY }, { x: pEnd.x, y: pEnd.y }) <= lw2) return true;
                    if (this.distToSegmentSquared({ x, y }, { x: geom.negX, y: geom.negY }, { x: nEnd.x, y: nEnd.y }) <= lw2) return true;
                }
            } else {
                // Check placeholder (20x20 box)
                const size = 20;
                if (Math.abs(inst.x - x) <= size / 2 && Math.abs(inst.y - y) <= size / 2) return true;
            }
        } else if (inst.type === 'surround_via_array') {
            const geom = this.getSurroundViaArrayGeometry(inst);
            if (geom) {
                const gndPIndex = inst.properties.gndPadstackIndex;
                let gndRadius = 5;
                if (gndPIndex >= 0 && gndPIndex < state.padstacks.length) {
                    const gp = state.padstacks[gndPIndex];
                    const gMaxD = gp.padSize || gp.holeDiameter || 0;
                    gndRadius = gMaxD / 2;
                }

                for (const c of geom.centers) {
                    if (Math.sqrt((c.x - x) ** 2 + (c.y - y) ** 2) <= gndRadius) return true;
                }
            } else {
                // Check placeholder (20x20 box)
                const size = 20;
                if (Math.abs(inst.x - x) <= size / 2 && Math.abs(inst.y - y) <= size / 2) return true;
            }
        } else {
            const dist = Math.sqrt((inst.x - x) ** 2 + (inst.y - y) ** 2);
            if (dist <= radius) return true;
        }
        return false;
    }

    distToSegmentSquared(p, v, w) {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
    }

    getDogBoneGeometry(inst) {
        const connectedId = inst.properties.connectedDiffPairId;
        if (!connectedId) return null;

        const parent = state.placedInstances.find(i => i.id === connectedId);
        if (!parent) return null;

        const len = inst.properties.length || 20;

        if (parent.type === 'single' || parent.type === 'gnd') {
            const startX = parent.x;
            const startY = parent.y;
            // Use 'angle' property, fallback to 45 if missing
            const angleVal = (inst.properties.angle !== undefined) ? inst.properties.angle : 45;
            const angleRad = angleVal * Math.PI / 180;

            const end = {
                x: startX + len * Math.cos(angleRad),
                y: startY + len * Math.sin(angleRad)
            };

            return { type: 'single', startX, startY, end };

        } else {
            // Differential logic
            const pitch = parent.properties.pitch || 1.0;
            const isVert = parent.properties.orientation === 'vertical';
            const dx = isVert ? 0 : pitch / 2;
            const dy = isVert ? pitch / 2 : 0;

            const posX = parent.x + dx;
            const posY = parent.y + dy;
            const negX = parent.x - dx;
            const negY = parent.y - dy;

            const posAngle = (inst.properties.posAngle || 45) * Math.PI / 180;
            const negAngle = (inst.properties.negAngle || 135) * Math.PI / 180;

            const pEnd = {
                x: posX + len * Math.cos(posAngle),
                y: posY + len * Math.sin(posAngle)
            };

            const nEnd = {
                x: negX + len * Math.cos(negAngle),
                y: negY + len * Math.sin(negAngle)
            };

            return { type: 'differential', posX, posY, negX, negY, pEnd, nEnd };
        }
    }

    getSurroundViaArrayGeometry(inst) {
        const connectedId = inst.properties.connectedDiffPairId;
        if (!connectedId) return null;

        const parent = state.placedInstances.find(i => i.id === connectedId);
        if (!parent) return null;

        // Must be differential or diff_gnd
        if (parent.type !== 'differential' && parent.type !== 'diff_gnd') return null;

        const pitch = parent.properties.pitch || 1.0;
        const isVert = parent.properties.orientation === 'vertical';
        const dx = isVert ? 0 : pitch / 2;
        const dy = isVert ? pitch / 2 : 0;

        const s1 = { x: parent.x - dx, y: parent.y - dy };
        const s2 = { x: parent.x + dx, y: parent.y + dy };

        const gndR = inst.properties.gndRadius || 15;
        const gndN = inst.properties.gndCount || 3;
        const gndStep = inst.properties.gndAngleStep || 30;

        const centers = [];

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

        let angleBase1, angleBase2;
        if (isVert) {
            angleBase1 = 270;
            angleBase2 = 90;
        } else {
            angleBase1 = 180;
            angleBase2 = 0;
        }

        const addGnds = (center, baseAngle) => {
            angles.forEach(a => {
                const rad = (baseAngle + a) * Math.PI / 180;
                const gx = center.x + gndR * Math.cos(rad);
                const gy = center.y + gndR * Math.sin(rad);
                centers.push({ x: gx, y: gy });
            });
        };

        addGnds(s1, angleBase1);
        addGnds(s2, angleBase2);

        return { centers };
    }

    getSnapPoint(x, y) {
        const snapDistScreen = 15; // pixels threshold
        const snapDist = snapDistScreen / state.canvasState.scale;
        const snapDistSq = snapDist * snapDist;

        let bestPoint = { x, y };
        let minDistSq = Infinity;

        const check = (px, py) => {
            const d2 = (px - x) ** 2 + (py - y) ** 2;
            if (d2 < snapDistSq && d2 < minDistSq) {
                minDistSq = d2;
                bestPoint = { x: px, y: py };
            }
        };

        state.placedInstances.forEach(inst => {
            const centers = this.getInstanceCenters(inst);
            centers.forEach(c => {
                // Snap to center
                check(c.x, c.y);

                // Snap to ring (0, 45, 90...)
                if (c.radius > 0) {
                    for (let angle = 0; angle < 360; angle += 45) {
                        const rad = angle * Math.PI / 180;
                        const rx = c.x + c.radius * Math.cos(rad);
                        const ry = c.y + c.radius * Math.sin(rad);
                        check(rx, ry);
                    }
                }
            });
        });

        return bestPoint;
    }

    getInstanceCenters(inst) {
        const centers = [];
        const pIndex = inst.padstackIndex;
        let radius = 0;
        if (pIndex >= 0 && pIndex < state.padstacks.length) {
            const p = state.padstacks[pIndex];
            const maxD = p.padSize || p.holeDiameter || 0;
            radius = maxD / 2;
        }

        if (inst.type === 'single' || inst.type === 'gnd') {
            centers.push({ x: inst.x, y: inst.y, radius });
        } else if (inst.type === 'differential' || inst.type === 'diff_gnd') {
            const pitch = inst.properties.pitch || 1.0;
            const isVert = inst.properties.orientation === 'vertical';
            const dx = isVert ? 0 : pitch / 2;
            const dy = isVert ? pitch / 2 : 0;
            centers.push({ x: inst.x - dx, y: inst.y - dy, radius });
            centers.push({ x: inst.x + dx, y: inst.y + dy, radius });

            if (inst.type === 'diff_gnd') {
                const gndR = inst.properties.gndRadius || 15;
                const gndN = inst.properties.gndCount || 3;
                const gndStep = inst.properties.gndAngleStep || 30;
                const gndPIndex = inst.properties.gndPadstackIndex;
                let gndRadius = 5;
                if (gndPIndex >= 0 && gndPIndex < state.padstacks.length) {
                    const gp = state.padstacks[gndPIndex];
                    const gMaxD = gp.padSize || gp.holeDiameter || 0;
                    gndRadius = gMaxD / 2;
                }

                // Calculate GND positions
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

                const s1 = { x: inst.x - dx, y: inst.y - dy };
                const s2 = { x: inst.x + dx, y: inst.y + dy };
                let angleBase1, angleBase2;

                if (isVert) {
                    angleBase1 = 270;
                    angleBase2 = 90;
                } else {
                    angleBase1 = 180;
                    angleBase2 = 0;
                }

                const addGnds = (center, baseAngle) => {
                    angles.forEach(a => {
                        const rad = (baseAngle + a) * Math.PI / 180;
                        const gx = center.x + gndR * Math.cos(rad);
                        const gy = center.y + gndR * Math.sin(rad);
                        centers.push({ x: gx, y: gy, radius: gndRadius });
                    });
                };

                addGnds(s1, angleBase1);
                addGnds(s2, angleBase2);
            }
        } else if (inst.type === 'dog_bone') {
            const geom = this.getDogBoneGeometry(inst);
            if (geom) {
                const diam = inst.properties.diameter || 10;
                const r = diam / 2;
                if (geom.type === 'single') {
                    centers.push({ x: geom.end.x, y: geom.end.y, radius: r });
                } else {
                    centers.push({ x: geom.pEnd.x, y: geom.pEnd.y, radius: r });
                    centers.push({ x: geom.nEnd.x, y: geom.nEnd.y, radius: r });
                }
            }
        } else if (inst.type === 'surround_via_array') {
            const geom = this.getSurroundViaArrayGeometry(inst);
            if (geom) {
                const gndPIndex = inst.properties.gndPadstackIndex;
                let gndRadius = 5;
                if (gndPIndex >= 0 && gndPIndex < state.padstacks.length) {
                    const gp = state.padstacks[gndPIndex];
                    const gMaxD = gp.padSize || gp.holeDiameter || 0;
                    gndRadius = gMaxD / 2;
                }
                for (const c of geom.centers) {
                    centers.push({ x: c.x, y: c.y, radius: gndRadius });
                }
            } else {
                // Placeholder center
                centers.push({ x: inst.x, y: inst.y, radius: 10 });
            }
        }
        return centers;
    }
}

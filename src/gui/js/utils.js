
export function addMessage(msg) {
    const msgBody = document.getElementById('message-body');
    if (!msgBody) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    msgBody.appendChild(entry);
    msgBody.scrollTop = msgBody.scrollHeight;

    if (window.pywebview) {
        console.log(msg);
    }
}

export function clearMessages() {
    const msgBody = document.getElementById('message-body');
    if (msgBody) msgBody.innerHTML = '';
}

export function copyMessages() {
    const msgBody = document.getElementById('message-body');
    if (!msgBody) return;
    const text = msgBody.innerText;
    navigator.clipboard.writeText(text).then(() => {
        addMessage("Messages copied to clipboard.");
    }).catch(err => {
        addMessage("Failed to copy messages: " + err);
    });
}

export function toggleMessageWindow() {
    const msgWindow = document.getElementById('message-window');
    if (!msgWindow) return;

    if (msgWindow.classList.contains('hidden')) {
        msgWindow.classList.remove('hidden');
    } else {
        msgWindow.classList.add('hidden');
    }
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

    } else if (inst.type === 'differential' || inst.type === 'diff_gnd') {
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
            const viaPitch = pitch;
            const arrowDir = inst.properties.arrowDirection || 0;

            // New Geometric Logic Parameters
            let d1 = isFeedIn ? (inst.properties.feedInD1 || 0) : (inst.properties.feedOutD1 || 0);
            const alpha = isFeedIn ? (inst.properties.feedInAlpha || 0) : (inst.properties.feedOutAlpha || 0);
            const R = isFeedIn ? (inst.properties.feedInR || 0) : (inst.properties.feedOutR || 0);
            const d2 = isFeedIn ? (inst.properties.feedInD2) : (inst.properties.feedOutD2);

            // Calculate Jog Length for 45-degree approach
            const jogLen = Math.abs(viaPitch - tracePitch) / 2;

            // Ensure d1 is at least jogLen
            d1 = Math.max(parseFloat(d1) || 0, jogLen);

            // Centerline Start
            const startPt = { x: inst.x, y: inst.y };

            // Determine initial direction vector
            let dirX = 0, dirY = 0;

            let baseDir = arrowDir;
            if (isFeedIn) baseDir = (arrowDir + 2) % 4;

            if (baseDir === 0) dirY = 1; // Up
            else if (baseDir === 1) dirX = 1; // Right
            else if (baseDir === 2) dirY = -1; // Down
            else if (baseDir === 3) dirX = -1; // Left

            // Generate Centerline Points
            const centerPoints = [];
            centerPoints.push({ x: startPt.x, y: startPt.y });

            let currX = startPt.x;
            let currY = startPt.y;
            let currDir = Math.atan2(dirY, dirX); // radians

            // Step 1: Move d1
            if (d1 > 0) {
                currX += d1 * Math.cos(currDir);
                currY += d1 * Math.sin(currDir);
                centerPoints.push({ x: currX, y: currY });
            }

            // Step 2: Turn alpha with radius R
            const turnAngle = parseFloat(alpha) || 0;
            const radius = parseFloat(R) || 0;

            if (turnAngle !== 0 && radius > 0) {
                const alphaRad = turnAngle * Math.PI / 180;
                const turnDir = Math.sign(turnAngle); // 1 for Left, -1 for Right
                const steps = 10; // Discretization
                const stepAngle = alphaRad / steps;

                // Center of curvature
                // Left turn (alpha > 0): Center is Left of current dir (+90 deg)
                // Right turn (alpha < 0): Center is Right of current dir (-90 deg)
                const cx = currX + radius * Math.cos(currDir + turnDir * Math.PI / 2);
                const cy = currY + radius * Math.sin(currDir + turnDir * Math.PI / 2);

                // Start angle from center
                // Vector P -> C is length R at (currDir + turnDir * 90)
                // Vector C -> P is opposite: (currDir + turnDir * 90) + 180
                // = currDir + turnDir * 90 - 180 (or + 180)
                // = currDir - turnDir * 90
                const startAngle = currDir - turnDir * Math.PI / 2;

                for (let i = 1; i <= steps; i++) {
                    const theta = startAngle + i * stepAngle;
                    const px = cx + radius * Math.cos(theta);
                    const py = cy + radius * Math.sin(theta);
                    centerPoints.push({ x: px, y: py });
                }

                currX = centerPoints[centerPoints.length - 1].x;
                currY = centerPoints[centerPoints.length - 1].y;
                currDir += alphaRad;
            }

            // Step 3: Move d2
            if (typeof d2 !== 'undefined' && d2 !== null && d2 !== "") {
                const dist2 = parseFloat(d2);
                if (dist2 > 0) {
                    currX += dist2 * Math.cos(currDir);
                    currY += dist2 * Math.sin(currDir);
                    centerPoints.push({ x: currX, y: currY });
                }
            } else {
                // Extend to board edge
                const halfW = boardW / 2;
                const halfH = boardH / 2;

                let tMin = Infinity;

                const check = (val, origin, dir) => {
                    if (Math.abs(dir) < 1e-9) return Infinity;
                    const t = (val - origin) / dir;
                    if (t < -1e-9) return Infinity;
                    return t;
                };

                let t = check(halfW, currX, Math.cos(currDir));
                let yAt = currY + t * Math.sin(currDir);
                if (t < tMin && yAt >= -halfH && yAt <= halfH) tMin = t;

                t = check(-halfW, currX, Math.cos(currDir));
                yAt = currY + t * Math.sin(currDir);
                if (t < tMin && yAt >= -halfH && yAt <= halfH) tMin = t;

                t = check(halfH, currY, Math.sin(currDir));
                let xAt = currX + t * Math.cos(currDir);
                if (t < tMin && xAt >= -halfW && xAt <= halfW) tMin = t;

                t = check(-halfH, currY, Math.sin(currDir));
                xAt = currX + t * Math.cos(currDir);
                if (t < tMin && xAt >= -halfW && xAt <= halfW) tMin = t;

                if (tMin !== Infinity) {
                    currX += tMin * Math.cos(currDir);
                    currY += tMin * Math.sin(currDir);
                    centerPoints.push({ x: currX, y: currY });
                }
            }

            // Generate Parallel Offset Paths
            const offset = tracePitch / 2;
            const path1 = [];
            const path2 = [];

            for (let i = 0; i < centerPoints.length; i++) {
                const pt = centerPoints[i];
                let dx, dy;

                if (i < centerPoints.length - 1) {
                    dx = centerPoints[i + 1].x - pt.x;
                    dy = centerPoints[i + 1].y - pt.y;
                } else if (i > 0) {
                    dx = pt.x - centerPoints[i - 1].x;
                    dy = pt.y - centerPoints[i - 1].y;
                } else {
                    dx = Math.cos(currDir);
                    dy = Math.sin(currDir);
                }

                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    const nx = -dy / len;
                    const ny = dx / len;
                    path1.push({ x: pt.x + nx * offset, y: pt.y + ny * offset });
                    path2.push({ x: pt.x - nx * offset, y: pt.y - ny * offset });
                } else {
                    path1.push({ x: pt.x, y: pt.y });
                    path2.push({ x: pt.x, y: pt.y });
                }
            }

            // Apply 45-degree Fan-out Logic
            const p1_jogEnd = {
                x: path1[0].x + dirX * jogLen,
                y: path1[0].y + dirY * jogLen
            };

            const p2_jogEnd = {
                x: path2[0].x + dirX * jogLen,
                y: path2[0].y + dirY * jogLen
            };

            let finalPathP, finalPathN;

            const d11 = (v1.x - path1[0].x) ** 2 + (v1.y - path1[0].y) ** 2;
            const d12 = (v1.x - path2[0].x) ** 2 + (v1.y - path2[0].y) ** 2;

            let p1_pts, p2_pts;

            if (jogLen > 1e-6) {
                if (Math.abs(d1 - jogLen) > 1e-6) {
                    p1_pts = [p1_jogEnd, ...path1.slice(1)];
                    p2_pts = [p2_jogEnd, ...path2.slice(1)];
                } else {
                    p1_pts = path1.slice(1);
                    p2_pts = path2.slice(1);
                }
            } else {
                p1_pts = path1;
                p2_pts = path2;
            }

            if (d11 < d12) {
                finalPathP = [{ x: v1.x, y: v1.y }, ...p1_pts];
                finalPathN = [{ x: v2.x, y: v2.y }, ...p2_pts];
            } else {
                finalPathP = [{ x: v1.x, y: v1.y }, ...p2_pts];
                finalPathN = [{ x: v2.x, y: v2.y }, ...p1_pts];
            }

            return [finalPathP, finalPathN];
        };

        paths.feedIn = getDiffPaths(true);
        paths.feedOut = getDiffPaths(false);
    }

    return paths;
}

const fs = require("fs");
const EVENT_KEY_LIST = require("./eventKeys.js").EVENT_KEY_LIST;

// Web Worker for sprite rendering (Optimized)
const SpriteRenderWorker = `
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    if (type === 'renderSprite') {
        const { spritePixels, spriteWidth, spriteHeight, x, y, scale, rotation, canvasWidth, canvasHeight, globalOffsetX, globalOffsetY } = data;
        
        // spritePixels is now a flat Uint8ClampedArray for speed
        
        const adjustedX = Math.floor(x) - globalOffsetX;
        const adjustedY = Math.floor(y) - globalOffsetY;
        
        const angle = rotation * Math.PI / 180;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        
        const pivotX = adjustedX + (spriteWidth * scale) / 2;
        const pivotY = adjustedY + (spriteHeight * scale) / 2;
        
        function rotatedBounds(w, h, angle) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const hw = w / 2;
            const hh = h / 2;
            
            const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
            
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            
            for (const [px, py] of corners) {
                const rx = px * cos - py * sin;
                const ry = px * sin + py * cos;
                if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
                if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
            }
            return { minX: minX + hw, maxX: maxX + hw, minY: minY + hh, maxY: maxY + hh };
        }
        
        const bounds = rotatedBounds(spriteWidth * scale, spriteHeight * scale, angle);
        
        // Bounds checking to avoid looping unnecessary pixels
        const loopMinX = Math.max(0, (adjustedX + bounds.minX) | 0);
        const loopMaxX = Math.min(canvasWidth, (adjustedX + bounds.maxX) | 0);
        const loopMinY = Math.max(0, (adjustedY + bounds.minY) | 0);
        const loopMaxY = Math.min(canvasHeight, (adjustedY + bounds.maxY) | 0);
        
        const outputPixels = [];
        
        for (let py = loopMinY; py < loopMaxY; py++) {
            for (let px = loopMinX; px < loopMaxX; px++) {
                const tx = px - pivotX;
                const ty = py - pivotY;
                
                const ox = cosA * tx + sinA * ty + pivotX;
                const oy = -sinA * tx + cosA * ty + pivotY;
                
                const sx = ((ox - adjustedX) / scale) | 0;
                const sy = ((oy - adjustedY) / scale) | 0;
                
                if (sx < 0 || sy < 0 || sx >= spriteWidth || sy >= spriteHeight)
                    continue;
                
                // Optimized flat array access
                const pixelIndex = (sy * spriteWidth + sx) * 4;
                const r = spritePixels[pixelIndex];
                const g = spritePixels[pixelIndex + 1];
                const b = spritePixels[pixelIndex + 2];
                const a = spritePixels[pixelIndex + 3];
                
                if (a === 0) continue;
                
                // We push a simple object, but we could optimize this further to a flat array return
                outputPixels.push({ px, py, r, g, b, a });
            }
        }
        
        self.postMessage({ type: 'renderComplete', pixels: outputPixels });
    }
};
`;

// Web Worker for collision detection
const CollisionWorker = `
self.onmessage = function(e) {
    const { type, data } = e.data;
    if (type === 'checkCollisions') {
        const { sprites, checkPairs } = data;
        const collisions = [];
        for (const [idA, idB] of checkPairs) {
            const a = sprites[idA];
            const b = sprites[idB];
            if (!a || !b) continue;
            const collision = !(
                a.x + a.hitbox.width < b.x || a.x > b.x + b.hitbox.width ||
                a.y + a.hitbox.height < b.y || a.y > b.y + b.hitbox.height
            );
            if (collision) collisions.push({ idA, idB });
        }
        self.postMessage({ type: 'collisionsComplete', collisions });
    }
};
`;

class Renderer {
    constructor({ width = 1920, height = 1080, layers = 1, autoResize = true, backgroundColor = { r: 255, g: 255, b: 255 } } = {}) {
        this.width = width;
        this.height = height;
        this.backgroundColor = backgroundColor;
        this.layers = layers;
        this.autoResize = autoResize;

        this.spriteCache = new Map();
        this.idSourceMap = new Map();
        this.layerBuffer = [];
        this.spritePos = {};
        this.globalOffset = { x: 0, y: 0 };
        this.drawCounter = 0;
        
        // Web Worker pool setup
        this.workerPool = [];
        this.workerQueue = []; // Queue for tasks waiting for a worker
        this.maxWorkers = navigator.hardwareConcurrency || 4;
        this.initWorkerPool();
    }

    initWorkerPool() {
        const workerBlob = new Blob([SpriteRenderWorker], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(workerUrl);
            this.workerPool.push(worker);
        }
    }

    // Fixed: Instant resolution instead of polling
    getAvailableWorker() {
        return new Promise((resolve) => {
            if (this.workerPool.length > 0) {
                resolve(this.workerPool.pop());
            } else {
                this.workerQueue.push(resolve);
            }
        });
    }

    releaseWorker(worker) {
        if (this.workerQueue.length > 0) {
            // Immediately give the worker to the next waiting task
            const nextResolve = this.workerQueue.shift();
            nextResolve(worker);
        } else {
            this.workerPool.push(worker);
        }
    }

    init() {
        const container = document.getElementById("canvas");
        if (!container) throw new Error("Element #canvas not found");
        container.innerHTML = "";

        const canvas = document.createElement("canvas");
        canvas.id = "canvas";
        canvas.width = this.width;
        canvas.height = this.height;

        container.id = "container";
        container.appendChild(canvas);

        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }

    async loadSprite(src) {
        if (this.spriteCache.has(src)) return this.spriteCache.get(src);

        const img = new Image();
        img.src = src;
        await new Promise(res => img.onload = res);

        const temp = document.createElement("canvas");
        const tctx = temp.getContext("2d");
        temp.width = img.width;
        temp.height = img.height;
        tctx.drawImage(img, 0, 0);
        
        // Store as Uint8ClampedArray (Flat) for performance
        const { data } = tctx.getImageData(0, 0, img.width, img.height);
        
        const sprite = {
            width: img.width,
            height: img.height,
            pixels: data // Keep as flat array
        };

        this.spriteCache.set(src, sprite);
        return sprite;
    }

    async renderSprite({id, src, x = 0, y = 0, scale = 1, layer = 0, rotation = 0}) {
        this.idSourceMap.set(id, src);
        const sprite = await this.loadSprite(src);
        x = Math.floor(x);
        y = Math.floor(y);
        if (!sprite) return;
        
        this.spritePos[id] = { 
            x, y, scale, rotation, 
            renderIndex: this.drawCounter++, 
            hitbox: { width: sprite.width * scale, height: sprite.height * scale }, 
            layer: layer
        };

        // FIX: Synchronously initialize buffer to prevent Race Condition
        if (!this.layerBuffer[layer]) {
            this.layerBuffer[layer] = this.ctx.createImageData(
                this.canvas.width,
                this.canvas.height
            );
        }
        
        // Capture the buffer reference synchronously
        const currentBuffer = this.layerBuffer[layer];

        const worker = await this.getAvailableWorker();
        
        return new Promise((resolve) => {
            worker.onmessage = (e) => {
                if (e.data.type === 'renderComplete') {
                    const data = currentBuffer.data;
                    const W = this.canvas.width;
                    
                    // Direct manipulation of the shared buffer
                    for (const pixel of e.data.pixels) {
                        const idx = (pixel.py * W + pixel.px) * 4;
                        // Simple alpha blending or overwrite
                        data[idx] = pixel.r;
                        data[idx + 1] = pixel.g;
                        data[idx + 2] = pixel.b;
                        data[idx + 3] = pixel.a;
                    }
                    
                    this.releaseWorker(worker);
                    resolve();
                }
            };
            
            worker.postMessage({
                type: 'renderSprite',
                data: {
                    spritePixels: sprite.pixels, // Sending flat array is faster
                    spriteWidth: sprite.width,
                    spriteHeight: sprite.height,
                    x, y, scale, rotation,
                    canvasWidth: this.canvas.width,
                    canvasHeight: this.canvas.height,
                    globalOffsetX: this.globalOffset.x,
                    globalOffsetY: this.globalOffset.y
                }
            });
        });
    }

    async flush() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const finalFrame = this.ctx.createImageData(W, H);
        const out = finalFrame.data;
        
        // Fill Background
        const bg = this.backgroundColor;
        const r = bg.r, g = bg.g, b = bg.b;
        for (let i = 0; i < out.length; i += 4) {
            out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
        }

        // Merge Layers
        for (let i = 0; i < this.layerBuffer.length; i++) {
            const layer = this.layerBuffer[i];
            if (!layer) continue;
            const src = layer.data;
            for (let p = 0; p < src.length; p += 4) {
                const a = src[p + 3];
                if (a === 0) continue;
                out[p] = src[p]; out[p + 1] = src[p + 1]; out[p + 2] = src[p + 2]; out[p + 3] = a;
            }
        }
        this.ctx.putImageData(finalFrame, 0, 0);
    }

    async clearLayers() {
        // Reset buffers efficiently
        this.layerBuffer = [];
    }
    
    // ... [Rest of Renderer methods remain mostly the same] ...
    async checkForExistingSprite(id) { return this.spritePos.hasOwnProperty(id); }

    async updateSpritePosition(id, {x, y, scale, rotation}) {
        if (!this.spritePos[id]) throw new Error(`Sprite with ID ${id} does not exist.`);
        await this.renderSprite({
            id: id,
            src: this.idSourceMap.get(id),
            x: x, y: y, scale: scale, rotation: rotation,
            layer: this.spritePos[id].layer
        });
    }

    async shiftCamera(x, y) { this.globalOffset.x = x; this.globalOffset.y = y; }
    async getSpritePositions() { return this.spritePos; }
    getCameraOffset() { return this.globalOffset; }
    destroy() {
        for (const worker of this.workerPool) worker.terminate();
        this.workerPool = []; this.workerQueue = [];
    }
}

class Pxlatd {
    constructor(name) {
        this.name = name;
        this.renderer = null;
        this.queue = [];
        this.playingSound = {};
        this.camerLocked = false;
        this.lockedSpriteId = null;
        this.deleteQueue = [];
        this.deletedSprites = new Set();
        this.collisionWorker = null;
        this.initCollisionWorker();
    }

    initCollisionWorker() {
        const workerBlob = new Blob([CollisionWorker], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        this.collisionWorker = new Worker(workerUrl);
    }

    init({ window = { width: 1920, height: 1080, autoResize: false, backgroundColor: { r: 255, g: 255, b: 255 } }, physics = {} }) {
        this.renderer = new Renderer(window);
        this.renderer.init();
    }

    initEventLoop(targetFPS = 60, tickrate) {
        const renderFrameTime = 1000 / targetFPS;
        let last = performance.now();

        const loop = async () => {
            const now = performance.now();
            last = now;

            if (this.camerLocked && this.lockedSpriteId) {
                const spritePos = this.renderer.spritePos[this.lockedSpriteId];
                if (spritePos) {
                    const camX = spritePos.x - (this.renderer.width / 2);
                    const camY = spritePos.y - (this.renderer.height / 2);
                    this.renderer.shiftCamera(camX, camY);
                }
            }

            if (this.renderer.autoResize) {
                const container = document.getElementById("container");
                if (this.renderer.canvas.width !== container.clientWidth) {
                    this.renderer.canvas.width = container.clientWidth;
                    this.renderer.canvas.height = container.clientHeight;
                }
            }

            // 1. Clear State
            await this.renderer.clearLayers();

            if (this.deleteQueue.length > 0) await this.processDeleteQueue();
            
            const changedSprites = this.queue.map(item => ({
                id: item.id, pos: item
            }));
            
            const spritePositions = await this.renderer.getSpritePositions();
            const changedIds = new Set(this.queue.map(item => item.id));
            const unchangedSprites = [];

            for (const [id, pos] of Object.entries(spritePositions)) {
                if (!changedIds.has(id) && !this.deletedSprites.has(id)) {
                    unchangedSprites.push({ id, pos });
                }
            }

            const allRenderTasks = [...changedSprites, ...unchangedSprites].map(({id, pos}) => 
                this.renderer.updateSpritePosition(id, {
                    x: pos.x, y: pos.y, scale: pos.scale, rotation: pos.rotation
                })
            );

            this.queue = []; 
            await Promise.all(allRenderTasks);
            await this.flush();

            const frameElapsed = performance.now() - now;
            const delay = Math.max(0, renderFrameTime - frameElapsed);
            
            setTimeout(loop, delay);
        };

        loop();
    }

    async loadScene(filePath) {
        fs.readFile(filePath, "utf8", (err, data) => {
            if (err) return console.error(err);
            const parsed = JSON.parse(data);
            this.renderer.spritePos = parsed.posData;
            this.renderer.idSourceMap = new Map(parsed.idSourceMap);
        });
    }

    async renderSprite(args) { await this.renderer.renderSprite(args); }
    async flush() { await this.renderer.flush(); }
    
    async queueAdd(id, visual = false, physics = false, { x, y, scale, rotation }) {
        if (!this.renderer.checkForExistingSprite(id)) throw new Error(`ID ${id} missing.`);
        if (visual) this.queue.push({ id, x, y, scale, rotation });
    }

    async processDeleteQueue() {
        for(const id of this.deleteQueue) await this.deleteSprite(id);
        this.deleteQueue = [];
    }

    async processQueueParallel() { /* Logic moved to initEventLoop */ }
    async rerenderUnchangedSpritesParallel() { /* Logic moved to initEventLoop */ }

    async onKeyPress(key, run) {
        window.addEventListener("keydown", async (e) => { if (e.key === key) await run(); });
    }

    async onMouseClick(button, run) {
        if (!this.renderer?.canvas) return;
        this.renderer.canvas.addEventListener("click", async (e) => {
            if (e.button !== button) return;
            const rect = this.renderer.canvas.getBoundingClientRect();
            const x = (e.clientX + this.renderer.getCameraOffset().x - rect.left) * (this.renderer.canvas.width / rect.width);
            const y = (e.clientY + this.renderer.getCameraOffset().y - rect.top) * (this.renderer.canvas.height / rect.height);
            
            const hits = [];

            for (const [id, pos] of Object.entries(this.renderer.spritePos)) {
                const sprite = this.renderer.spriteCache.get(
                    this.renderer.idSourceMap.get(id)
                );
                if (!sprite) continue;

                const w = sprite.width * pos.scale;
                const h = sprite.height * pos.scale;

                if (
                    x >= pos.x &&
                    x <= pos.x + w &&
                    y >= pos.y &&
                    y <= pos.y + h
                ) {
                    hits.push({
                        id,
                        pos,
                        layer: pos.layer ?? 0,
                        renderIndex: pos.renderIndex ?? 0
                    });
                }
            }

            let hit = null;

            if (hits.length > 0) {
                // Sort exactly like rendering:
                // 1) higher layer
                // 2) higher renderIndex (drawn later)
                hits.sort((a, b) => {
                    if (a.layer !== b.layer) return b.layer - a.layer;
                    return b.renderIndex - a.renderIndex;
                });

                const top = hits[0];
                hit = {
                    id: top.id,
                    localX: x - top.pos.x,
                    localY: y - top.pos.y
                };
            }
             await run(x, y, hit);
        });
    }

    shiftCamera(x, y) { this.renderer.shiftCamera(x, y); }
    lockCameraToSprite(id) { this.lockedSpriteId = id; this.camerLocked = true; }
    unlockCamera() { this.camerLocked = false; }
    
    async deleteSprite(id) {
        delete this.renderer.spritePos[id];
        this.renderer.idSourceMap?.delete(id);
    }

    async checkCollisionsBatch(pairs) {
        return new Promise((resolve) => {
            this.collisionWorker.onmessage = (e) => {
                if (e.data.type === 'collisionsComplete') resolve(e.data.collisions);
            };
            this.collisionWorker.postMessage({ type: 'checkCollisions', data: { sprites: this.renderer.spritePos, checkPairs: pairs } });
        });
    }

    playSound(id, src) {
        const audio = new Audio(src);
        audio.play();
        this.playingSound[id] = audio;
    }
    stopSound(id) { if(this.playingSound[id]) { this.playingSound[id].pause(); delete this.playingSound[id]; } }
    listAllEventKeys() { return EVENT_KEY_LIST; }
    getSpriteData() { return this.renderer.spritePos; }
    destroy() { this.renderer.destroy(); this.collisionWorker?.terminate(); }
}

module.exports = { Pxlatd, Renderer };
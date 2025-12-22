const fs = require("fs");
const EVENT_KEY_LIST = require("./eventKeys.js").EVENT_KEY_LIST;

const CollisionWorkerCode = `
self.onmessage = function(e) {
    const { type, data } = e.data;
    if (type === 'checkCollisions') {
        const { spriteData, pairs } = data;
        const collisions = [];
        const stride = 4;
        for (let i = 0; i < pairs.length; i++) {
            const idA = pairs[i][0], idB = pairs[i][1];
            const idxA = idA * stride, idxB = idB * stride;
            const ax = spriteData[idxA], ay = spriteData[idxA+1], aw = spriteData[idxA+2], ah = spriteData[idxA+3];
            const bx = spriteData[idxB], by = spriteData[idxB+1], bw = spriteData[idxB+2], bh = spriteData[idxB+3];
            if (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by) {
                collisions.push({ idA, idB });
            }
        }
        self.postMessage({ type: 'collisionsComplete', collisions });
    }
};
`;

class Renderer {
    constructor({ width = 1920, height = 1080, layers = 1, autoResize = true, backgroundColor = { r: 255, g: 255, b: 255 } } = {}) {
        this.width = width;
        this.height = height;
        this.backgroundColor = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},1)`;
        this.layers = layers;
        this.autoResize = autoResize;
        this.canvas = null;
        this.ctx = null;
        this.spriteCache = new Map();
        this.idSourceMap = new Map();
        this.sprites = new Map();
        this.globalOffset = { x: 0, y: 0 };
    }

    async init() {
        const container = document.getElementById("canvas");
        if (!container) throw new Error("Element #canvas not found");
        container.innerHTML = "";
        const canvas = document.createElement("canvas");
        canvas.id = "canvas";
        canvas.style.display = "block";
        canvas.width = this.width;
        canvas.height = this.height;
        container.id = "container";
        container.appendChild(canvas);
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    }

    async loadSprite(src) {
        if (this.spriteCache.has(src)) return this.spriteCache.get(src);
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            const spriteData = { bitmap, width: bitmap.width, height: bitmap.height };
            this.spriteCache.set(src, spriteData);
            return spriteData;
        } catch (e) {
            return null;
        }
    }

    async renderSprite({id, src, x = 0, y = 0, scale = 1, layer = 0, rotation = 0}) {
        this.idSourceMap.set(id, src);
        let spriteAsset = this.spriteCache.get(src);
        if (!spriteAsset) spriteAsset = await this.loadSprite(src);
        if (!spriteAsset) return;
        this.sprites.set(id, { id, src, bitmap: spriteAsset.bitmap, x: x | 0, y: y | 0, w: spriteAsset.width, h: spriteAsset.height, scale, rotation, layer });
    }

    async updateSpritePosition(id, {x, y, scale, rotation}) {
        const s = this.sprites.get(id);
        if (s) {
            s.x = x; s.y = y;
            if (scale !== undefined) s.scale = scale;
            if (rotation !== undefined) s.rotation = rotation;
        }
    }

    deleteSprite(id) {
        this.sprites.delete(id);
        this.idSourceMap.delete(id);
    }

    shiftCamera(x, y) {
        this.globalOffset.x = x;
        this.globalOffset.y = y;
    }

    drawFrame() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        const camX = this.globalOffset.x, camY = this.globalOffset.y;
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, W, H);
        const renderList = Array.from(this.sprites.values()).sort((a, b) => a.layer - b.layer);
        for (let i = 0, len = renderList.length; i < len; i++) {
            const s = renderList[i];
            const drawX = s.x - camX 
            const drawY = s.y - camY;
            const destW = s.w * s.scale 
            const destH = s.h * s.scale;
            if (drawX + destW < 0 || drawX > W || drawY + destH < 0 || drawY > H) continue;
            if (s.rotation !== 0) {
                ctx.save();
                ctx.translate(drawX + destW / 2 , drawY + destH / 2);
                ctx.rotate(s.rotation * Math.PI / 180);
                ctx.drawImage(s.bitmap, -destW / 2, -destH / 2, destW, destH);
                ctx.restore();
            } else {
                ctx.drawImage(s.bitmap, drawX, drawY, destW, destH);
            }
        }
    }

    destroy() {
        this.spriteCache.clear();
        this.sprites.clear();
    }
}

class Pxlatd {
    constructor(name) {
        this.name = name;
        this.renderer = null;
        this.queue = [];
        this.playingSound = {};
        this.cameraLocked = false;
        this.lockedSpriteId = null;
        this.deleteQueue = [];
        this.collisionWorker = null;
        this.loopFunctions = new Map()
    }

    async init({ window = { width: 1920, height: 1080, autoResize: false, backgroundColor: { r: 255, g: 255, b: 255 } }, physics = {} }) {
        this.renderer = new Renderer(window);
        await this.renderer.init();
        await this.initCollisionWorker();
    }

    async initCollisionWorker() {
        const blob = new Blob([CollisionWorkerCode], { type: 'application/javascript' });
        this.collisionWorker = new Worker(URL.createObjectURL(blob));
    }

    initEventLoop(targetFPS = 60, tickrate = 60) {
        const frameTime = 1000 / targetFPS;
        const tickTime = 1000 / tickrate;
        let lastFrameTime = 0;
        let lastTickTime = 0;
        
        const loop = (timestamp) => {
            const tickDelta = timestamp - lastTickTime;
            if (tickDelta >= tickTime) {
                lastTickTime = timestamp - (tickDelta % tickTime);
                
                this.loopFunctions.forEach((value, key) => {
                    value()
                });
            }
            
            const frameDelta = timestamp - lastFrameTime;
            if (frameDelta >= frameTime) {
                lastFrameTime = timestamp - (frameDelta % frameTime);
                
                if (this.deleteQueue.length) {
                    this.deleteQueue.forEach(id => this.renderer.deleteSprite(id));
                    this.deleteQueue = [];
                }

                for (const item of this.queue) this.renderer.updateSpritePosition(item.id, item);

                this.queue = [];

                if (this.cameraLocked && this.lockedSpriteId) {
                    const s = this.renderer.sprites.get(this.lockedSpriteId);
                    if (s) {
                        const cx = s.x - (this.renderer.width / 2) + (s.w * s.scale / 2);
                        const cy = s.y - (this.renderer.height / 2) + (s.h * s.scale / 2);
                        this.renderer.shiftCamera(cx, cy);
                    }
                }
                if (this.renderer.autoResize) {
                    const c = this.renderer.canvas, p = c.parentElement;
                    if (c.width !== p.clientWidth || c.height !== p.clientHeight) {
                        c.width = p.clientWidth; 
                        c.height = p.clientHeight;
                        this.renderer.width = c.width; 
                        this.renderer.height = c.height;
                    }
                }
                this.renderer.drawFrame();
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    async queueAdd(id, visual = false, physics = false, { x, y, scale, rotation }) {
        if(visual) this.queue.push({ id, x, y, scale, rotation });
    }

    async renderSprite(args) { await this.renderer.renderSprite(args); }
    async updateSpritePosition(id, args) { this.renderer.updateSpritePosition(id, args); }
    async deleteSprite(id) { this.deleteQueue.push(id); }

    async checkCollisionsBatch(pairs) {
        const sprites = this.renderer.sprites;
        const buffer = new Float32Array(sprites.size * 4);
        const idToIndex = new Map();
        let i = 0;
        for (const [id, s] of sprites) {
            idToIndex.set(id, i);
            const base = i * 4;
            buffer[base] = s.x; buffer[base+1] = s.y; 
            buffer[base+2] = s.w * s.scale; 
            buffer[base+3] = s.h * s.scale;
            i++;
        }
        const indexPairs = [];
        for(const [idA, idB] of pairs) {
            if(idToIndex.has(idA) && idToIndex.has(idB)) indexPairs.push([idToIndex.get(idA), idToIndex.get(idB)]);
        }
        return new Promise(resolve => {
            this.collisionWorker.onmessage = (e) => {
                if(e.data.type === 'collisionsComplete') {
                    const indexToId = Array.from(idToIndex.keys());
                    const collisionList = e.data.collisions.map(c => ({ idA: indexToId[c.idA], idB: indexToId[c.idB] }));
                    resolve(collisionList);
                }
            };
            this.collisionWorker.postMessage({ type: 'checkCollisions', data: { spriteData: buffer, pairs: indexPairs } }, [buffer.buffer]);
        });
    }

    async loadScene(filePath) {
        fs.readFile(filePath, "utf8", async (err, data) => {
            if (err) return;
            const parsed = JSON.parse(data);
            this.renderer.sprites.clear();
            for (const [id, pos] of Object.entries(parsed.posData)) {
                const src = parsed.idSourceMap.find(x => x[0] === id)?.[1];
                if (src) await this.renderer.renderSprite({ id, src, x: pos.x, y: pos.y, scale: pos.scale, rotation: pos.rotation, layer: pos.layer });
            }
        });
    }

    async onMouseClick(button, run) {
        if (!this.renderer.canvas) return;
        this.renderer.canvas.addEventListener("click", async (e) => {
            if (e.button !== button) return;
            const rect = this.renderer.canvas.getBoundingClientRect();
            const scaleX = this.renderer.canvas.width / rect.width, scaleY = this.renderer.canvas.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX + this.renderer.globalOffset.x;
            const my = (e.clientY - rect.top) * scaleY + this.renderer.globalOffset.y;
            const sprites = Array.from(this.renderer.sprites.values()).reverse();
            let hit = null;
            for (const s of sprites) {
                const w = s.w * s.scale, h = s.h * s.scale;
                if (mx >= s.x && mx <= s.x + w && my >= s.y && my <= s.y + h) {
                    hit = { id: s.id, localX: mx - s.x, localY: my - s.y };
                    break;
                }
            }
            await run(mx, my, hit);
        });
    }

    addFrameFunction(name, func){
        this.loopFunctions.set(name, func)
    }

    removeFrameFunction(name){
        if (!this.loopFunctions.has(name)) return
        this.loopFunctions.delete(name)
    }

    playSound(id, src) {
        const audio = new Audio(src);
        audio.play().catch(() => {});
        this.playingSound[id] = audio;
    }

    stopSound(id) {
        if(this.playingSound[id]) {
            this.playingSound[id].pause();
            delete this.playingSound[id];
        }
    }

    shiftCamera(x, y) {
         this.renderer.shiftCamera(x, y);
    }

    lockCameraToSprite(id) { 
        this.lockedSpriteId = id; this.cameraLocked = true; 
    }

    unlockCamera() { 
        this.cameraLocked = false; 
    }

    listAllEventKeys() {
         return EVENT_KEY_LIST; 
    }

    getSpriteData() { 
        return this.renderer.sprites; 
    }

    destroy() { 
        this.renderer.destroy(); this.collisionWorker?.terminate();
    }

    async flush() {}
    async processQueueParallel() {}
    async rerenderUnchangedSpritesParallel() {}
    async onKeyPress(key, run){ 
        window.addEventListener("keydown", async (e) => { 
            if (e.key === key) await run(); 
        }); 
    }
}

module.exports = { Pxlatd, Renderer };
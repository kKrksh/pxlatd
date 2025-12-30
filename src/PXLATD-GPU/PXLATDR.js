const fs = require("fs");
const EVENT_KEY_LIST = require("./eventKeys.js").EVENT_KEY_LIST;
const piDiv180 = Math.PI / 180;
let minFps = Infinity;

/**
 * PHYSICS WORKER CODE
 * 
 * This worker handles collision detection.
 */
const CollisionWorkerCode = `
class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }

    // Bit-pack coordinates into single integer for faster lookups
    getKey(x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return (cellX << 16) | (cellY & 0xFFFF);
    }

    // Insert sprite into all cells it overlaps
    insert(index, x, y, w, h) {
        const minCellX = Math.floor(x / this.cellSize);
        const minCellY = Math.floor(y / this.cellSize);
        const maxCellX = Math.floor((x + w) / this.cellSize);
        const maxCellY = Math.floor((y + h) / this.cellSize);

        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
                const key = (cx << 16) | (cy & 0xFFFF);
                if (!this.grid.has(key)) {
                    this.grid.set(key, []);
                }
                this.grid.get(key).push(index);
            }
        }
    }

    // Get all sprites in cells overlapping the query box
    query(x, y, w, h) {
        const candidates = new Set();
        const minCellX = Math.floor(x / this.cellSize);
        const minCellY = Math.floor(y / this.cellSize);
        const maxCellX = Math.floor((x + w) / this.cellSize);
        const maxCellY = Math.floor((y + h) / this.cellSize);

        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
                const key = (cx << 16) | (cy & 0xFFFF);
                const cell = this.grid.get(key);
                if (cell) {
                    cell.forEach(idx => candidates.add(idx));
                }
            }
        }

        return Array.from(candidates);
    }

    clear() {
        this.grid.clear();
    }
}

// Fast AABB collision using bitwise AND for better performance
function aabbCollision(ax, ay, aw, ah, bx, by, bw, bh) {
    return (ax < bx + bw) & (ax + aw > bx) & (ay < by + bh) & (ay + ah > by);
}

self.onmessage = function(event) {
    const { type, data } = event.data;

    if (type === 'checkCollisions') {
        const { spriteData, pairs, useSpatialHash } = data;
        const collisions = [];
        const STRIDE = 4;

        const spriteCount = spriteData.length / STRIDE;

        if (useSpatialHash) {
            // BROAD PHASE: Spatial Hashing
            // Calculate optimal cell size based on sprite data
            let totalSize = 0;
            
            for (let i = 0; i < Math.min(10, spriteCount); i++) {
                const ptr = i * STRIDE;
                totalSize += Math.sqrt(spriteData[ptr + 2] * spriteData[ptr + 3]);
            }
            
            const avgSize = totalSize / Math.min(10, spriteCount);
            const cellSize = Math.max(64, avgSize * 2);
            
            const spatialHash = new SpatialHash(cellSize);

            // Insert all sprites into spatial hash
            for (let i = 0; i < spriteCount; i++) {
                const ptr = i * STRIDE;
                spatialHash.insert(
                    i,
                    spriteData[ptr],
                    spriteData[ptr + 1],
                    spriteData[ptr + 2],
                    spriteData[ptr + 3]
                );
            }

            // NARROW PHASE: Check only nearby sprites
            const checked = new Set();
            
            for (let i = 0; i < spriteCount; i++) {
                const ptrA = i * STRIDE;
                const ax = spriteData[ptrA];
                const ay = spriteData[ptrA + 1];
                const aw = spriteData[ptrA + 2];
                const ah = spriteData[ptrA + 3];

                // Query spatial hash for nearby sprites
                const candidates = spatialHash.query(ax, ay, aw, ah);

                for (const j of candidates) {
                    if (i >= j) continue; // Avoid duplicate checks (A vs B = B vs A)
                    
                    // Use bit-packed key to track checked pairs
                    const pairKey = (i << 16) | j;
                    if (checked.has(pairKey)) continue;
                    checked.add(pairKey);

                    const ptrB = j * STRIDE;
                    const bx = spriteData[ptrB];
                    const by = spriteData[ptrB + 1];
                    const bw = spriteData[ptrB + 2];
                    const bh = spriteData[ptrB + 3];

                    if (aabbCollision(ax, ay, aw, ah, bx, by, bw, bh)) {
                        collisions.push({ idA: i, idB: j });
                    }
                }
            }
        } else {
            // DIRECT PAIR CHECKING (for small collision sets)
            // If no pairs provided, check all vs all
            if (pairs.length === 0) {
                for (let i = 0; i < spriteCount; i++) {
                    const ptrA = i * STRIDE;
                    const ax = spriteData[ptrA];
                    const ay = spriteData[ptrA + 1];
                    const aw = spriteData[ptrA + 2];
                    const ah = spriteData[ptrA + 3];

                    for (let j = i + 1; j < spriteCount; j++) {
                        const ptrB = j * STRIDE;
                        const bx = spriteData[ptrB];
                        const by = spriteData[ptrB + 1];
                        const bw = spriteData[ptrB + 2];
                        const bh = spriteData[ptrB + 3];

                        if (aabbCollision(ax, ay, aw, ah, bx, by, bw, bh)) {
                            collisions.push({ idA: i, idB: j });
                        }
                    }
                }
            } else {
                // Check specific pairs
                for (let i = 0; i < pairs.length; i++) {
                    const indexA = pairs[i][0];
                    const indexB = pairs[i][1];

                    const pointerA = indexA * STRIDE;
                    const pointerB = indexB * STRIDE;

                    const ax = spriteData[pointerA];
                    const ay = spriteData[pointerA + 1];
                    const aw = spriteData[pointerA + 2];
                    const ah = spriteData[pointerA + 3];

                    const bx = spriteData[pointerB];
                    const by = spriteData[pointerB + 1];
                    const bw = spriteData[pointerB + 2];
                    const bh = spriteData[pointerB + 3];

                    if (aabbCollision(ax, ay, aw, ah, bx, by, bw, bh)) {
                        collisions.push({ idA: indexA, idB: indexB });
                    }
                }
            }
        }

        self.postMessage({ type: 'collisionsComplete', collisions });
    }
};
`;

/**

 * RENDERER CLASS
 * 
 * Handles the HTML5 Canvas, GPU-accelerated image drawing, and sprite management.
 */
class Renderer {
    constructor({ 
        width = 1920, 
        height = 1080, 
        layers = 1, 
        autoResize = true, 
        backgroundColor = { r: 255, g: 255, b: 255 } 
    } = {}) {
        this.width = width;
        this.height = height;
        this.layers = layers;
        this.autoResize = autoResize;
        this.backgroundColor = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},1)`;
        this.canvas = null;
        this.context = null;
        this.spriteCache = new Map();
        this.idSourceMap = new Map();
        this.sprites = new Map();
        this.globalOffset = { x: 0, y: 0 };
    }

    /**
     * Initializes the Canvas element and attaches it to the DOM.
     */
    init() {
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

        this.context = canvas.getContext("2d", { 
            alpha: false, 
            desynchronized: true 
        });
    }

    /**
     * Loads an image from a URL and converts it to an ImageBitmap.
     */
    async loadSprite(sourcePath) {
        if (this.spriteCache.has(sourcePath)) {
            return this.spriteCache.get(sourcePath);
        }

        try {
            const response = await fetch(sourcePath);
            const blob = await response.blob();
            
            const bitmap = await createImageBitmap(blob);
            
            const spriteData = { 
                bitmap: bitmap, 
                width: bitmap.width, 
                height: bitmap.height 
            };

            this.spriteCache.set(sourcePath, spriteData);
            return spriteData;
        } catch (error) {
            console.error("Failed to load sprite:", sourcePath, error);
            return null;
        }
    }

    /**
     * Creates a new sprite or updates an existing one completely.
     */
    async renderSprite({ id, src, x = 0, y = 0, scale = 1, layer = 0, rotation = 0 }) {
        this.idSourceMap.set(id, src);
        const existingSprite = this.sprites.get(id);

        if (!existingSprite || existingSprite.layer !== layer) {
            this.renderListDirty = true;
        }

        let spriteAsset = this.spriteCache.get(src);
        
        if (!spriteAsset) {
            spriteAsset = await this.loadSprite(src);
        }
        
        if (!spriteAsset) return;

        this.sprites.set(id, {
            id: id,
            src: src,
            bitmap: spriteAsset.bitmap,
            x: Math.floor(x),
            y: Math.floor(y),
            width: spriteAsset.width,
            height: spriteAsset.height,
            scale: scale,
            rotation: rotation,
            layer: layer
        });
    }

    /**
     * Updates the position/transform of an existing sprite.
     */
    async updateSpritePosition(id, { x, y, scale, rotation }) {
        const sprite = this.sprites.get(id);
        if (sprite) {
            sprite.x = x;
            sprite.y = y;
            if (scale !== undefined) sprite.scale = scale;
            if (rotation !== undefined) sprite.rotation = rotation;
        }
    }

    deleteSprite(id) {
        this.sprites.delete(id);
        this.idSourceMap.delete(id);
        this.renderListDirty = true;
    }

    shiftCamera(x, y) {
        this.globalOffset.x = x;
        this.globalOffset.y = y;
    }

    /**
     * This function draws the frame.
     */
    drawFrame() {
        const ctx = this.context;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const cameraX = this.globalOffset.x;
        const cameraY = this.globalOffset.y;

        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        if (this.sprites.size === 0) return;

        if (this.renderListDirty || !this.cachedRenderList) {
            this.cachedRenderList = Array.from(this.sprites.values())
                .sort((a, b) => a.layer - b.layer);
            this.renderListDirty = false;
        }

        const renderList = this.cachedRenderList;
        const spriteCount = renderList.length;

        const nonRotatedSprites = [];
        const rotatedSprites = [];

        for (let i = 0; i < spriteCount; i++) {
            const sprite = renderList[i];
            
            const destWidth = sprite.width * sprite.scale;
            const destHeight = sprite.height * sprite.scale;
            const drawX = sprite.x - cameraX;
            const drawY = sprite.y - cameraY;

            const margin = sprite.rotation !== 0 ? Math.max(destWidth, destHeight) * 0.5 : 0;
            
            if (
                drawX + destWidth + margin < 0 || 
                drawX - margin > canvasWidth || 
                drawY + destHeight + margin < 0 || 
                drawY - margin > canvasHeight
            ) {
                continue;
            }

            const renderData = {
                bitmap: sprite.bitmap,
                drawX,
                drawY,
                destWidth,
                destHeight,
                rotation: sprite.rotation
            };

            if (sprite.rotation !== 0) {
                rotatedSprites.push(renderData);
            } else {
                nonRotatedSprites.push(renderData);
            }
        }

        for (let i = 0; i < nonRotatedSprites.length; i++) {
            const s = nonRotatedSprites[i];
            ctx.drawImage(s.bitmap, s.drawX, s.drawY, s.destWidth, s.destHeight);
        }

        if (rotatedSprites.length > 0) {
            ctx.save();
            
            for (let i = 0; i < rotatedSprites.length; i++) {
                const s = rotatedSprites[i];
                
                const centerX = s.drawX + s.destWidth * 0.5;
                const centerY = s.drawY + s.destHeight * 0.5;
                
                ctx.setTransform(1, 0, 0, 1, centerX, centerY);
                ctx.rotate(s.rotation * piDiv180);

                ctx.drawImage(
                    s.bitmap, 
                    -s.destWidth * 0.5, 
                    -s.destHeight * 0.5, 
                    s.destWidth, 
                    s.destHeight
                );
            }
            
            ctx.restore();
        }

        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    renderText(x, y, text, size, rotation, fontFamily, color){
        try {
            let displayText = document.createElement("p")
            displayText.innerHTML = text
            displayText.style = `
            font-size: ${size}px;
            transform: rotate(${rotation}deg);
            position: absolute;
            top: ${y}px;
            left: ${x}px;
            font-family: ${fontFamily};
            color: ${color}`

            document.body.appendChild(displayText)
        } catch(e){
            console.warn(`Something went wrong while rendering the text ${text}`)
        }
    }


    destroy() {
        this.spriteCache.clear();
        this.sprites.clear();
    }
}

/**
 * PXLATD ENGINE CORE
 * 
 * The main controller that manages the Game Loop, Physics, and Input.
 */
class Pxlatd {
    #renderer = null;
    #queue = [];
    #playingSound = {};
    #cameraLocked = false;
    #lockedSpriteId = null;
    #deleteQueue = [];
    #listerners = {
        collision: null,
        sceneLoad: null,
        destroy: null
    };
    #loopFunctions = new Map();
    #collisionWorker = null;
    #spatialHashThreshold = 20;

    constructor(name) {
        this.name = name;
    }

    /**
     * Setup the engine and renderer
     */
    init({ window = { width: 1920, height: 1080, autoResize: false, backgroundColor: { r: 255, g: 255, b: 255 } }, physics = {} }) {
        this.#renderer = new Renderer(window);
        this.#renderer.init();
        this.#initCollisionWorker();
    }

    /**
     * Creates the separate thread for physics calculations
     */
    #initCollisionWorker() {
        const blob = new Blob([CollisionWorkerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        this.#collisionWorker = new Worker(workerUrl);
    }

    /**
     * Starts the Game Loop using requestAnimationFrame.
     */
    initEventLoop(targetFPS = 60, tickrate = 60) {
        const frameInterval = 1000 / targetFPS;
        const tickTime = 1000 / tickrate;
        let lastTickTime = performance.now();
        let frameAccumulator = 0;
        let lastFrameTime = performance.now();

        const loop = (timestamp) => {
            const deltaTime = timestamp - lastFrameTime;
            lastFrameTime = timestamp;

            const tickDelta = timestamp - lastTickTime;
            if (tickDelta >= tickTime) {
                if (this.#listerners.collision){
                    const collisionData = this.checkCollisions()

                    if (collisionData.length){
                        this.#handleEvent("collision", collisionData)
                    }
                }
                lastTickTime = timestamp;
                this.#loopFunctions.forEach((value) => value());
            }

            frameAccumulator += deltaTime;
            
            if (frameAccumulator >= frameInterval) {
                frameAccumulator -= frameInterval;

                if (frameAccumulator > frameInterval) {
                    frameAccumulator = 0;
                }

                if (this.#deleteQueue.length > 0) {
                    this.#deleteQueue.forEach(id => this.#renderer.deleteSprite(id));
                    this.#deleteQueue = [];
                }

                for (const item of this.#queue) {
                    this.#renderer.updateSpritePosition(item.id, item);
                }
                this.#queue = [];

                if (this.#cameraLocked && this.#lockedSpriteId) {
                    const sprite = this.#renderer.sprites.get(this.#lockedSpriteId);
                    if (sprite) {
                        const centerX = sprite.x - (this.#renderer.width / 2) + (sprite.width * sprite.scale / 2);
                        const centerY = sprite.y - (this.#renderer.height / 2) + (sprite.height * sprite.scale / 2);
                        this.#renderer.shiftCamera(centerX, centerY);
                    }
                }

                if (this.#renderer.autoResize) {
                    const canvas = this.#renderer.canvas;
                    const parent = canvas.parentElement;

                    if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
                        canvas.width = parent.clientWidth;
                        canvas.height = parent.clientHeight;
                        this.#renderer.width = canvas.width;
                        this.#renderer.height = canvas.height;
                    }
                }

                this.#renderer.drawFrame();
            }
            
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    async queueAdd(id, visual = false, physics = false, { x, y, scale, rotation }) {
        if (visual) {
            this.#queue.push({ id, x, y, scale, rotation });
        }
    }

    async renderSprite(args) { 
        await this.#renderer.renderSprite(args); 
    }

    async updateSpritePosition(id, args) { 
        this.#renderer.updateSpritePosition(id, args); 
    }

    async deleteSprite(id) { 
        this.#deleteQueue.push(id); 
    }

    /**
     * Checks for collisions between all sprites. Return all pairs as an array.
     */

    async checkCollisions(filterFn = null) {
        const sprites = this.#renderer.sprites;
        const spriteCount = sprites.size;

        if (spriteCount === 0) return [];

        const useSpatialHash = spriteCount > (this.#spatialHashThreshold || 20);

        const bufferSize = spriteCount * 4;
        const buffer = new Float32Array(bufferSize);
        const idToIndexMap = new Map();
        let index = 0;

        for (const [id, sprite] of sprites) {
            idToIndexMap.set(id, index);

            const baseIndex = index * 4;
            buffer[baseIndex] = sprite.x;
            buffer[baseIndex + 1] = sprite.y;
            buffer[baseIndex + 2] = sprite.width * sprite.scale;
            buffer[baseIndex + 3] = sprite.height * sprite.scale;

            index++;
        }

        return new Promise(resolve => {
            this.#collisionWorker.onmessage = (e) => {
                if (e.data.type === 'collisionsComplete') {
                    const indexToIdList = Array.from(idToIndexMap.keys());

                    let collisionList = e.data.collisions.map(c => ({
                        idA: indexToIdList[c.idA],
                        idB: indexToIdList[c.idB]
                    }));

                    if (filterFn) {
                        collisionList = collisionList.filter(filterFn);
                    }

                    resolve(collisionList);
                }
            };

            this.#collisionWorker.postMessage({ 
                type: 'checkCollisions', 
                data: { 
                    spriteData: buffer, 
                    pairs: [],
                    useSpatialHash: useSpatialHash
                } 
            }, [buffer.buffer]);
        });
    }

    /**
     * Checks for collisions between specific pairs of sprites.
     */
    async checkCollisionsBatch(pairs) {
        const sprites = this.#renderer.sprites;
        const spriteCount = sprites.size;

        const bufferSize = spriteCount * 4;
        const buffer = new Float32Array(bufferSize);
        const idToIndexMap = new Map();
        let index = 0;

        for (const [id, sprite] of sprites) {
            idToIndexMap.set(id, index);

            const baseIndex = index * 4;
            buffer[baseIndex] = sprite.x;
            buffer[baseIndex + 1] = sprite.y;
            buffer[baseIndex + 2] = sprite.width * sprite.scale;
            buffer[baseIndex + 3] = sprite.height * sprite.scale;

            index++;
        }

        const validPairs = [];
        for (const [idA, idB] of pairs) {
            if (idToIndexMap.has(idA) && idToIndexMap.has(idB)) {
                validPairs.push([
                    idToIndexMap.get(idA), 
                    idToIndexMap.get(idB)
                ]);
            }
        }

        return new Promise(resolve => {
            this.#collisionWorker.onmessage = (e) => {
                if (e.data.type === 'collisionsComplete') {
                    const indexToIdList = Array.from(idToIndexMap.keys());

                    const collisionList = e.data.collisions.map(c => ({
                        idA: indexToIdList[c.idA],
                        idB: indexToIdList[c.idB]
                    }));

                    resolve(collisionList);
                }
            };

            this.#collisionWorker.postMessage({ 
                type: 'checkCollisions', 
                data: { 
                    spriteData: buffer, 
                    pairs: validPairs,
                    useSpatialHash: false
                } 
            }, [buffer.buffer]);
        });
    }

    /**
     * Loads a scene configuration from a JSON file.
     */
    async loadScene(filePath) {
        fs.readFile(filePath, "utf8", async (err, data) => {
            if (err) return console.error("Scene load failed:", err);

            const parsed = JSON.parse(data);
            this.#renderer.sprites.clear();

            for (const [id, pos] of Object.entries(parsed.posData)) {
                const srcEntry = parsed.idSourceMap.find(entry => entry[0] === id);
                const sourcePath = srcEntry ? srcEntry[1] : null;

                if (sourcePath) {
                    await this.#renderer.renderSprite({
                        id,
                        src: sourcePath,
                        x: pos.x,
                        y: pos.y,
                        scale: pos.scale,
                        rotation: pos.rotation,
                        layer: pos.layer
                    });
                }
            }
        });
        this.#handleEvent("sceneLoaded", filePath)
    }

    /**
     * Mouse Click Handler
     */
    async onMouseClick(button, callback) {
        if (!this.#renderer.canvas) return;

        this.#renderer.canvas.addEventListener("click", async (e) => {
            if (e.button !== button) return;

            const rect = this.#renderer.canvas.getBoundingClientRect();
            const scaleX = this.#renderer.canvas.width / rect.width;
            const scaleY = this.#renderer.canvas.height / rect.height;

            const mouseX = (e.clientX - rect.left) * scaleX + this.#renderer.globalOffset.x;
            const mouseY = (e.clientY - rect.top) * scaleY + this.#renderer.globalOffset.y;

            const sprites = Array.from(this.#renderer.sprites.values()).reverse();
            let hit = null;

            for (const sprite of sprites) {
                const width = sprite.width * sprite.scale;
                const height = sprite.height * sprite.scale;

                if (
                    mouseX >= sprite.x &&
                    mouseX <= sprite.x + width &&
                    mouseY >= sprite.y &&
                    mouseY <= sprite.y + height
                ) {
                    hit = {
                        id: sprite.id,
                        localX: mouseX - sprite.x,
                        localY: mouseY - sprite.y
                    };
                    break;
                }
            }

            await callback(mouseX, mouseY, hit);
        });
    }

    playSound(id, src) {
        const audio = new Audio(src);
        audio.play().catch(e => console.warn("Audio failed to play:", e));
        this.#playingSound[id] = audio;
    }

    stopSound(id) {
        if (this.#playingSound[id]) {
            this.#playingSound[id].pause();
            delete this.#playingSound[id];
        }
    }

    shiftCamera(x, y) { 
        this.#renderer.shiftCamera(x, y); 
    }

    lockCameraToSprite(id) { 
        this.#lockedSpriteId = id; 
        this.#cameraLocked = true; 
    }

    unlockCamera() { 
        this.#cameraLocked = false; 
    }

    listAllEventKeys() { 
        return EVENT_KEY_LIST; 
    }

    getSpriteData() { 
        return this.#renderer.sprites; 
    }

    destroy() {
        this.#renderer.destroy();
        if (this.#collisionWorker) {
            this.#collisionWorker.terminate();
        }
        this.#handleEvent("destroy")
    }

    addFrameFunction(name, func){
        this.#loopFunctions.set(name, func);
    }

    removeFrameFunction(name){
        if (!this.#loopFunctions.has(name)) return;
        this.#loopFunctions.delete(name);
    }

    renderText(x, y, text, size, rotation, fontFamily, color){
        this.#renderer.renderText(x, y, text, size, rotation, fontFamily, color)
    }

    //Deprecated / Compatibility Methods
    async flush() {}
    async processQueueParallel() {}
    async rerenderUnchangedSpritesParallel() {}

    async onKeyPress(key, callback) { 
        window.addEventListener("keydown", async (e) => { 
            if (e.key === key) await callback(); 
        }); 
    }

    // Adds event listener for specified event
    async listen(event = "collision" || "connect" || "destroy" || "sceneLoad", callback){
        if (this.#listerners.hasOwnProperty(event))
            this.#listerners[event] = callback;
        else 
            throw new Error(`Event ${event} doesn't exist`);
    }

    async #handleEvent(event, eventData){
        if (this.#listerners.hasOwnProperty(event) && this.#listerners[event]){
            await this.#listerners[event](eventData);
        }
    }
}


module.exports = { Pxlatd, Renderer };
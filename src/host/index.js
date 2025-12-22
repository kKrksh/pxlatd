const Renderer = require("../render/index.js");
const Physics = require("../physics/index.js");
const fs = require("fs")
const EVENT_KEY_LIST = require("./eventKeys.js").EVENT_KEY_LIST;


module.exports = class Pxlatd {
    constructor(name) {
        this.name = name;
        this.renderer = null;
        this.physics = null;
        this.queue = [];
        this.playingSound = {};
        this.camerLocked = false;
        this.lockedSpriteId = null;
        this.deleteQueue = []
        this.deletedSprites = new Set();
        this.loopFunctions = []
    }

    //init enginge
    init({
        window = {
            width: 1920,
            height: 1080,
            autoResize: false,
            backgroundColor: {
                r: 255,
                g: 255,
                b: 255
            }
        }, physics = {
            globalGravity: 9.81,
            globalVelocity: 0
        }
    }){
        this.renderer = new Renderer(window);
        this.renderer.init();
        this.physics = new Physics(physics);
    }

    //start even loop
    initEventLoop(targetFPS = 60, tickrate) {
        const renderFrameTime = 1000 / targetFPS;
        const physicsStep = 1000 / tickrate; //physics independant from fps

        let last = performance.now();
        let accumulator = 0;

        const loop = async () => {
            const now = performance.now();
            const elapsed = now - last;
            last = now;

            accumulator += elapsed;

            // fixed physics, temp disabled
            /*while (accumulator >= physicsStep) {
                this.physics.update(physicsStep / 1000);
                accumulator -= physicsStep;
            }*/

            for (let i = 0; i < this.loopFunctions.length; i++){
                this.loopFunctions[i]()
            }    

            if (this.camerLocked) {
                const spritePos = this.renderer.spritePos[this.lockedSpriteId];
                if (spritePos) {
                    const camX = spritePos.x - (this.renderer.width / 2);
                    const camY = spritePos.y - (this.renderer.height / 2);
                    this.renderer.shiftCamera(camX, camY, false);
                }
            }

            if (this.renderer.autoResize) {
                console.log("resizing");

                const canvas = document.getElementById("canvas");
                const container = document.getElementById("container");

                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
            }

            await this.renderer.clearLayers();

            if (this.deleteQueue.length > 0) {
                await this.processDeleteQueue();
            }

            if (this.queue.length > 0) {
                await this.processQueue();
            }

            await this.rerenderUnchangedSprites();
            await this.flush();

            const frameElapsed = performance.now() - now;
            const delay = Math.max(0, renderFrameTime - frameElapsed);

            setTimeout(loop, delay);
        };

        loop();
    }

    async loadScene(filePath){
        fs.readFile(filePath, "utf8", (err, data) => {
            if (err) {
                console.error("Error reading JSON:", err);
                return;
            }
            const parsed = JSON.parse(data);
            const restoredMap = new Map(parsed.idSourceMap);

            this.renderer.spritePos = parsed.posData
            this.renderer.idSourceMap = restoredMap
        })
    }


    //prerenders sprite "src"
    async renderSprite({id, src, x = 0, y = 0, scale = 1, layer = 0, fromSource = true }){
        await this.renderer.renderSprite({id : id, src : src, x : x, y : y, scale : scale, layer : layer, fromSource : fromSource });
    }

    //display renders
    async flush(){  
        await this.renderer.flush();
    }

    //queue changes to object
    async queueAdd(id, visual = false, physics = false, {
        x = 0,
        y = 0,
        scale = 1,
        rotation = 0
    } ){
        physics = false; // temp disable physics

        if (!this.renderer.checkForExistingSprite(id)) throw new Error(`Sprite with ID ${id} does not exist in renderer.`);
        if (visual){
            this.queue.push({type: "visual", id, x, y, scale, rotation});
        }
        if (physics){
            this.queue.push({type: "physics", id, gravity, velocity});
        }
    }
    //process queued changes inbetween frames
    async processQueue(){
        for (let i = 0; i < this.queue.length; i++){
            await this.renderer.updateSpritePosition(this.queue[i].id, {
                x: this.queue[i].x,
                y: this.queue[i].y,
                scale: this.queue[i].scale,
                rotation: this.queue[i].rotation
            });
        }
        this.queue = [];
    }

    async addDeleteQueue(id) {
        this.deleteQueue.push(id);
        this.queue = this.queue.filter(item => item.id !== id);
        this.deletedSprites.add(id);
    }

    async processDeleteQueue() {
        for (let i = 0; i < this.deleteQueue.length; i++) {
            await this.deleteSprite(this.deleteQueue[i]);
        }
        this.previousQueue = [...this.deleteQueue]
        this.deleteQueue = [];
    }

    async rerenderUnchangedSprites() {
        const spritePositions = await this.renderer.getSpritePositions();
        const alreadyQueued = new Set(this.queue.map(item => item.id));

        for (const [id, pos] of Object.entries(spritePositions)) {
            if (
                alreadyQueued.has(id) ||
                this.deletedSprites.has(id)
            ) continue;

            this.queueAdd(id, true, false, {
                x: pos.x,
                y: pos.y,
                scale: pos.scale,
                rotation: pos.rotation
            });
        }
    }

    //reset display
    async clear(){
        await this.renderer.clearLayers();
    }

    //keyboard input handler
    async onKeyPress(key, run){
        window.addEventListener("keydown", async (e) => {
            if (e.key === key) await run();
        });
    }

    //mouse input handler and hit detection
    async onMouseClick(button, run = async (x, y, hit) => {}) {
        if (!this.renderer || !this.renderer.canvas) {
            throw new Error("Renderer not initialized before setting mouse listener.");
        }

        const canvas = this.renderer.canvas;

        canvas.addEventListener("click", async (e) => {
            if (e.button !== button) return;

            const rect = canvas.getBoundingClientRect();

            // screen → world coords
            const x = (e.clientX + this.renderer.getCameraOffset().x - rect.left) *
                    (canvas.width / rect.width);
            const y = (e.clientY + this.renderer.getCameraOffset().y - rect.top) *
                    (canvas.height / rect.height);

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

    runFunctionPerFrame(func){
        loopFunctions.push(func)
    }

    shiftCamera(x, y, rerender = true){
        console.log("Shifting camera:", x, y);
        this.renderer.shiftCamera(x, y);
        if (rerender) this.rerenderUnchangedSprites();
    }

    lockCameraToSprite(id){
        this.lockedSpriteId = id;
        this.camerLocked = true;
    }

    unlockCamera(){
        this.camerLocked = false;
    }

    async deleteSprite(id) {
        delete this.renderer.spritePos[id];
        this.renderer.idSourceMap?.delete(id);
        this.renderer.spriteCache?.delete?.(id);
    }

    //aabb collision detection
    checkCollision(a, b) {
        a = this.renderer.spritePos[a];
        b = this.renderer.spritePos[b];
        return !(
            a.x + a.hitbox.width < b.x ||
            a.x > b.x + b.hitbox.width ||
            a.y + a.hitbox.height < b.y ||
            a.y > b.y + b.hitbox.height
        );
    }

    playSound(id, src){
        const audio = new Audio(src);
        audio.play();
        this.playingSound[id] = audio;
    }

    stopSound(id){
        if (this.playingSound[id]){
            this.playingSound[id].pause();
            delete this.playingSound[id];
        }
    }

    //helper func to list all event keys
    listAllEventKeys(){
        console.log(EVENT_KEY_LIST);
        return EVENT_KEY_LIST;
    }

    getSpriteData(){
        return this.renderer.spritePos
    }

};
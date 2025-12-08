const Renderer = require("../render/index.js");
const Physics = require("../physics/index.js");
const EVENT_KEY_LIST = require("./eventKeys.js").EVENT_KEY_LIST;


module.exports = class Pxlatd {
    constructor(name) {
        this.name = name;
        this.renderer = null;
        this.physics = null;
        this.queue = [];
        this.playingSound = {};
    }
    //init enginge
    init({
        window = {
            width: 1920,
            height: 1080,
            autoResize: false
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
    initEventLoop(fps = 60) {
        const tickRate = 1000 / fps;
        //async event loop
        const loop = async () => {
            while (true) {
                const start = performance.now();
                if (this.queue.length > 0) this.clear();
                await this.processQueue()
                await this.rerenderUnchangedSprites();
                await this.flush();
                console.log(`Event loop tick at ${this.name}`);

                const elapsed = performance.now() - start;
                const delay = Math.max(0, tickRate - elapsed);
                if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
            }
        };

        loop();
    }
    //prerenders sprite "src"
    async renderSprite({id, src, x = 0, y = 0, scale = 1, layer = 0 }){
        await this.renderer.renderSprite({id : id, src : src, x : x, y : y, scale : scale, layer : layer });
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
    async rerenderUnchangedSprites(){
        for (const [id, pos] of Object.entries(this.renderer.spritePos)) {
            await this.renderer.renderSprite({id: id, src: this.renderer.idSourceMap.get(id), x: pos.x, y: pos.y, scale: pos.scale, rotation: pos.rotation, layer: pos.layer});
        }
    }
    //reset display
    async clear(){
        await this.renderer.clearLayers();
    }
    //keyboard input handler
    async onKeyPress(key, run){
        window.addEventListener("keydown", async (e) => {
            if (e.key === key) {
                await run();
            }
        });   
    }
    //mouse input handler and hit 1 detection
    async onMouseClick(button, run = async (x, y, hit) => {}) {
        if (!this.renderer || !this.renderer.canvas) {
            throw new Error("Renderer not initialized before setting mouse listener.");
        }

        const canvas = this.renderer.canvas;

        canvas.addEventListener("click", async (e) => {
            if (e.button !== button) return;

            const rect = canvas.getBoundingClientRect();

            //display to canvas coords
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);

            //sprite hit?
            let hit = null;

            for (const [id, pos] of Object.entries(this.renderer.spritePos)) {
                const sprite = this.renderer.spriteCache.get(this.renderer.idSourceMap.get(id));
                if (!sprite) continue;

                const w = sprite.width * pos.scale;
                const h = sprite.height * pos.scale;

                if (x >= pos.x && x <= pos.x + w && y >= pos.y && y <= pos.y + h) {
                    hit = { id, localX: x - pos.x, localY: y - pos.y };
                    break;
                }
            }
            await run(x, y, hit);
        });
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

};
const Renderer = require("../render/index.js");
const Physics = require("../physics/index.js");


module.exports = class Pxlatd {
    constructor(name) {
        this.name = name;
        this.renderer = null;
        this.physics = null;
        this.queue = [];
    }

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

    initEventLoop(fps = 40) {
        const tickRate = 1000 / fps;

        const loop = async () => {
            while (true) {
                const start = performance.now();
                if (this.queue.length > 0) this.clear();
                await this.processQueue()
                await this.flush();
                console.log(`Event loop tick at ${this.name}`);

                const elapsed = performance.now() - start;
                const delay = Math.max(0, tickRate - elapsed);
                if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
            }
        };

        loop();
    }
    
    async renderSprite({id, src, x = 0, y = 0, scale = 1, layer = 0 }){
        await this.renderer.renderSprite({id : id, src : src, x : x, y : y, scale : scale, layer : layer });
    }

    async flush(){  
        await this.renderer.flush();
    }

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

    async clear(){
        await this.renderer.clearLayers();
    }
};
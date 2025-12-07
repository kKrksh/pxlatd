module.exports = class Physics {
    constructor({ globalGravity = 9.81, globalVelocity = 0} = {}) {
        this.gravity = globalGravity;
        this.velocity = globalVelocity;
        this.hitBoxes = {};
        this.globalEntities = {};
    }

    setHitbox(id, {
        width, height, offsetX = 0, offsetY = 0
    }){
        this.hitBoxes[id] = {}
    }

    applyProperties(id, {gravity = this.gravity, velocity = this.velocity, mass = 1}) {

    }

    sendGlobalEntities(){
        return this.globalEntities;
    }

    receiveGlobalEntities(entities){
        this.globalEntities = entities;
    }
}
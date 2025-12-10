module.exports = class Physics {
    constructor({ globalGravity = 9.81, globalVelocity = 0} = {}) {
        this.gravity = globalGravity;
        this.velocity = globalVelocity;
        this.hitBoxes = {};
        this.properties = {};
    }

    setProperties(id, { mass = 1, gravity, velocityX = 0}){
        this.properties[id] = {
            mass: mass,
            gravity: gravity !== undefined ? gravity : this.gravity,
            velocityX: velocityX !== undefined ? velocityX : this.velocity
        };
    }

    
}
const Renderer = require("./src/render/index.js");
const Physics = require("./src/physics/index.js");
/*
window.addEventListener('DOMContentLoaded', async () => {
  const pxl = new Renderer({
    width: 1920,
    height: 1080,
    autoResize: false});
  pxl.init();
  for (let i = 0; i < 10; i++) {
      console.time("rendering");
      console.time("total")
      await pxl.renderSprite(
        { id: "player",
          src: "src\\sprites\\test2.png",
          x: 0 + i * 10,
          y: 0 + i * 10,
          scale: 1,
          layer: 0
        });
      await pxl.flush();
  }
});*/

const Pxlatd = require("./src/host/index.js");
let startingx = 500;
let startingy = 500;

window.addEventListener('DOMContentLoaded', async () => {
    const pxl = new Pxlatd("Test");
    pxl.init({
        window: { 
            width: 1920,
            height: 1080,
            autoResize: false 
        },
        physics: { 
            globalGravity: 9.81,
            globalVelocity: 0
        }
    });

    const movementFunc = (pxl, deltaX, deltaY) => async () => {
      startingx += deltaX;
      startingy += deltaY;

      await pxl.queueAdd("player", true, false, {
          x: startingx,
          y: startingy,
          scale: 1,
          rotation: 0
      });
    };

    pxl.onMouseClick(0, async (x, y, hit) => {
        console.log("Click:", x, y);
        await pxl.queueAdd("player", true, false, {
            x: x,
            y: y,
            scale: 1,
            rotation: 0
        });

        pxl.playSound("src\\sound\\ding.mp3");

        if (hit) {
            console.log("Clicked sprite:", hit.id);
            console.log("Sprite-local coords:", hit.localX, hit.localY);
        }

        startingx = x;
        startingy = y;
    });

    await pxl.renderSprite({
        id: "player",
        src: "src\\sprites\\test.jpg",
        x: 500,
        y: 500,
        scale: 1,
        layer: 0
    })
    
    await pxl.renderSprite({
        id: "player2",
        src: "src\\sprites\\test.jpg",
        x: 2000,
        y: 500,
        scale: 1,
        layer: 0
    })
    addEventListener("keypress", async (event) => {
        /*if (event.key === "Tab"){
          console.log(pxl.checkCollision("player", "player2"));
        }*/
       console.log("Keypress:", event.key);
       if (event.key === "w"){
          pxl.shiftCamera(400,0);
       }
    })

    pxl.lockCameraToSprite("player");

    pxl.initEventLoop(60);
    pxl.onKeyPress("ArrowRight", movementFunc(pxl, 10, 0));
    pxl.onKeyPress("ArrowLeft", movementFunc(pxl, -10, 0));
    pxl.onKeyPress("ArrowUp", movementFunc(pxl, 0, -10));
    pxl.onKeyPress("ArrowDown", movementFunc(pxl, 0, 10));

});

/*window.addEventListener("DOMContentLoaded", async () => {
  const pxl = new Renderer({
    width: 1920,
    height: 1080,
    autoResize: false});
  pxl.init();
  console.time("total");
  for (let i = 0; i < 361; i++) {
    console.time("rendering");
      await pxl.renderSprite(
        { id: "player",
          src: "src\\sprites\\test.jpg",
          x: 500,
          y: 500,
          scale: 10,
          rotation: i,
          layer: 0
    });
    console.timeEnd("rendering");
    console.time("flush");
    await pxl.flush();
    console.timeEnd("flush");
    console.time("clearLayers");
    await pxl.clearLayers();
    console.timeEnd("clearLayers");

    await new Promise(requestAnimationFrame);
  }

  console.timeEnd("total");
});*/
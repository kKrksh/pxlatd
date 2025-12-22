const {Pxlatd} = require("../PXLATD AI refined/pxlatd.js");
const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

let startingX = 0;
let startingY = 0;
let currentlyHoveredSprite = null;
let openedFiles = new Map();

window.addEventListener("DOMContentLoaded", async () => {
  const openFile = document.getElementById("openFile");
  const spriteInput = document.getElementById("spriteId");
  const xInput = document.getElementById("xCoords");
  const yInput = document.getElementById("yCoords");
  const scaleInput = document.getElementById("scale");
  const rotationInput = document.getElementById("rotation");
  const select = document.getElementById("fileSelector");

  const pxl = new Pxlatd("Test");

  pxl.init({
    window: {
      width: 1600,
      height: 800,
      autoResize: true,
      backgroundColor: { r: 255, g: 255, b: 255 }
    },
    physics: {
      globalGravity: 9.81,
      globalVelocity: 0
    }
  });

  function requestSpriteId() {
    return new Promise((resolve, reject) => {
      const overlay = document.getElementById("prompt-overlay");
      const message = document.getElementById("prompt-message");
      const input = document.getElementById("prompt-input");
      const okBtn = document.getElementById("prompt-ok");
      const cancelBtn = document.getElementById("prompt-cancel");

      message.textContent = "Enter Id";
      input.placeholder = "Enter Id";
      input.value = "";

      overlay.style.display = "flex";
      input.focus();

      const cleanup = () => {
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
      };

      const onOk = () => {
        const value = input.value.trim();
        if (!value) return;
        cleanup();
        overlay.style.display = "none";
        resolve(value);
      };

      const onCancel = () => {
        cleanup();
        overlay.style.display = "none";
        reject();
      };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
    });
  }


  function getSpriteData(id) {
    const data = pxl.getSpriteData()[id];
    return {
      x: data.x,
      y: data.y,
      scale: data.scale,
      rotation: data.rotation
    };
  }

  function displayData(id, data) {
    spriteInput.value = id;
    xInput.value = Math.floor(data.x);
    yInput.value = Math.floor(data.y);
    scaleInput.value = data.scale;
    rotationInput.value = data.rotation;
  }

  function resetInputs() {
    spriteInput.value = "";
    xInput.value = "";
    yInput.value = "";
    scaleInput.value = "";
    rotationInput.value = "";
  }


  openFile.addEventListener("click", async () => {
    const fileData = await ipcRenderer.invoke("read-file");
    if (!fileData) return;

    const [src, name] = fileData;

    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);

    openedFiles.set(name, src);

    try {
      const spriteId = await requestSpriteId();
      pxl.renderSprite({
        id: spriteId,
        src,
        x: 0,
        y: 0,
        scale: 1,
        layer: 3
      });
    } catch {
      console.log("Sprite creation cancelled");
    }
  });

  select.addEventListener("change", async e => {
    const file = e.target.value;
    if (file === "Select File") return;

    try {
      const spriteId = await requestSpriteId();
      pxl.renderSprite({
        id: spriteId,
        src: openedFiles.get(file),
        x: 0,
        y: 0,
        scale: 1,
        layer: 3
      });
    } catch {
      console.log("Sprite creation cancelled");
    }
  });

//input events

  xInput.addEventListener("change", e => {
    if (!currentlyHoveredSprite) return;
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: e.target.value,
      y: d.y,
      scale: d.scale,
      rotation: d.rotation
    });
  });

  yInput.addEventListener("change", e => {
    if (!currentlyHoveredSprite) return;
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: d.x,
      y: e.target.value,
      scale: d.scale,
      rotation: d.rotation
    });
  });

  scaleInput.addEventListener("change", e => {
    if (!currentlyHoveredSprite) return;
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: d.x,
      y: d.y,
      scale: e.target.value,
      rotation: d.rotation
    });
  });

  rotationInput.addEventListener("change", e => {
    if (!currentlyHoveredSprite) return;
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: d.x,
      y: d.y,
      scale: d.scale,
      rotation: e.target.value
    });
  });

//mouse and keyboard events

  pxl.onMouseClick(0, (x, y, hit) => {
    if (hit && hit.id !== currentlyHoveredSprite) {
      console.log("test")
      currentlyHoveredSprite = hit.id;
      displayData(hit.id, getSpriteData(hit.id));
      return;
    }

    if (!currentlyHoveredSprite) return;

    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x,
      y,
      scale: pxl.getSpriteData()[currentlyHoveredSprite].scale,
      rotation: pxl.getSpriteData()[currentlyHoveredSprite].rotation
    });

    displayData(currentlyHoveredSprite, {
      x,
      y,
      ...getSpriteData(currentlyHoveredSprite)
    });
  });

  pxl.onKeyPress("Escape", () => {
    resetInputs();
    currentlyHoveredSprite = null;
  });

  pxl.onKeyPress("Delete", () => {
    if (currentlyHoveredSprite) pxl.addDeleteQueue(currentlyHoveredSprite);
    currentlyHoveredSprite = null;
  });

  pxl.onKeyPress("ArrowRight", () => {
    if (!currentlyHoveredSprite) {
      startingX -= 10;
      pxl.shiftCamera(startingX, startingY);
      return;
    }
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: d.x + 10,
      y: d.y,
      rotation: d.rotation
    });
  });

  pxl.onKeyPress("ArrowLeft", () => {
    if (!currentlyHoveredSprite) {
      startingX += 10;
      pxl.shiftCamera(startingX, startingY);
      return;
    }
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: d.x - 10,
      y: d.y,
      rotation: d.rotation
    });
  });

  pxl.onKeyPress("ArrowUp", () => {
    if (!currentlyHoveredSprite) {
      startingY += 10;
      pxl.shiftCamera(startingX, startingY);
      return;
    }
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: d.x,
      y: d.y - 10,
      rotation: d.rotation
    });
  });

  pxl.onKeyPress("ArrowDown", () => {
    if (!currentlyHoveredSprite) {
      startingY -= 10;
      pxl.shiftCamera(startingX, startingY);
      return;
    }
    const d = getSpriteData(currentlyHoveredSprite);
    pxl.queueAdd(currentlyHoveredSprite, true, false, {
      x: d.x,
      y: d.y + 10,
      rotation: d.rotation
    });
  });

  
  pxl.initEventLoop(60);
  pxl.loadScene("src/sprites/data.json")
});
